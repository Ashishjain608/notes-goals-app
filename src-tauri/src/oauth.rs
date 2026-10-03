//! One-shot loopback listener for the OAuth redirect (ADR-0011). Plain
//! `std::net`: bind `127.0.0.1` and `[::1]` (browsers resolve `localhost` to
//! either), wait for `GET /callback?...`, answer with a tiny page, return the
//! parsed query. A newer call cancels an older pending one so the port frees.

use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

/// Bumped by every `oauth_wait_for_code`; an accept loop stops when it changes.
#[derive(Default)]
pub struct OAuthGeneration(AtomicU64);

#[derive(Debug, Default, PartialEq, Serialize)]
pub struct OAuthCallback {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// Decode `%XX` escapes (UTF-8, lossy); `plus_as_space` for form/query text.
pub fn percent_decode(s: &str, plus_as_space: bool) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let hex = |x: u8| (x as char).to_digit(16);
        match b[i] {
            b'%' if i + 2 < b.len() && hex(b[i + 1]).is_some() && hex(b[i + 2]).is_some() => {
                out.push((hex(b[i + 1]).unwrap() * 16 + hex(b[i + 2]).unwrap()) as u8);
                i += 3;
            }
            b'+' if plus_as_space => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Parse the request line of an HTTP request into `Some(callback)` for
/// `GET /callback?...`, `None` for any other target.
fn parse_callback(request_line: &str) -> Option<OAuthCallback> {
    let mut parts = request_line.split_whitespace();
    let (method, target) = (parts.next()?, parts.next()?);
    let query = target.strip_prefix("/callback")?.strip_prefix('?').or_else(|| {
        (target == "/callback").then_some("")
    })?;
    if method != "GET" {
        return None;
    }
    let mut cb = OAuthCallback::default();
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let v = Some(percent_decode(v, true));
        match k {
            "code" => cb.code = v,
            "state" => cb.state = v,
            "error" => cb.error = v,
            _ => {}
        }
    }
    Some(cb)
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let msg = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(msg.as_bytes());
}

/// Read the request line from a fresh connection and answer it. Returns the
/// callback when it was the redirect.
fn handle(mut stream: TcpStream) -> Option<OAuthCallback> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).unwrap_or(0);
    let head = String::from_utf8_lossy(&buf[..n]);
    let line = head.lines().next().unwrap_or("");
    let Some(cb) = parse_callback(line) else {
        respond(&mut stream, "404 Not Found", "Not found");
        return None;
    };
    let message = match &cb.error {
        Some(e) => format!("Dropbox sign-in failed: {}.", escape_html(e)),
        None => "Connected to Dropbox. You can close this tab and go back to Notes &amp; Goals.".to_string(),
    };
    respond(
        &mut stream,
        "200 OK",
        &format!("<!doctype html><meta charset=utf-8><title>Notes &amp; Goals</title><body style=\"font-family:system-ui;margin:3rem\"><p>{message}</p>"),
    );
    Some(cb)
}

fn wait_for_callback(
    port: u16,
    timeout: Duration,
    generation: &AtomicU64,
    mine: u64,
) -> AppResult<OAuthCallback> {
    let listeners: Vec<TcpListener> = ["127.0.0.1", "[::1]"]
        .iter()
        .filter_map(|host| TcpListener::bind(format!("{host}:{port}")).ok())
        .collect();
    if listeners.is_empty() {
        return Err(AppError::Io(std::io::Error::new(
            ErrorKind::AddrInUse,
            format!("could not listen on port {port}"),
        )));
    }
    for l in &listeners {
        l.set_nonblocking(true)?;
    }
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline && generation.load(Ordering::SeqCst) == mine {
        for l in &listeners {
            if let Ok((stream, _)) = l.accept() {
                if let Some(cb) = handle(stream) {
                    return Ok(cb);
                }
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    Err(AppError::OAuthTimeout)
}

/// Wait for the browser to hit `http://localhost:<port>/callback?...`.
#[tauri::command]
pub async fn oauth_wait_for_code(app: AppHandle, port: u16, timeout_secs: u64) -> AppResult<OAuthCallback> {
    let mine = app.state::<OAuthGeneration>().0.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn_blocking(move || {
        let generation = &app.state::<OAuthGeneration>().0;
        wait_for_callback(port, Duration::from_secs(timeout_secs), generation, mine)
    })
    .await
    .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_code_and_state() {
        let cb = parse_callback("GET /callback?code=a%2Fb+c&state=xyz HTTP/1.1").unwrap();
        assert_eq!(cb.code.as_deref(), Some("a/b c"));
        assert_eq!(cb.state.as_deref(), Some("xyz"));
        let cb = parse_callback("GET /callback?error=access_denied HTTP/1.1").unwrap();
        assert_eq!(cb.error.as_deref(), Some("access_denied"));
        assert!(parse_callback("GET /favicon.ico HTTP/1.1").is_none());
        assert!(parse_callback("POST /callback?code=1 HTTP/1.1").is_none());
    }

    #[test]
    fn percent_decode_handles_utf8_and_junk() {
        assert_eq!(percent_decode("caf%C3%A9%20%zz%", false), "café %zz%");
        assert_eq!(percent_decode("a+b", false), "a+b");
    }

    #[test]
    fn round_trip_ignores_favicon_then_returns_code() {
        let port = 41000 + (std::process::id() % 20000) as u16;
        let gen = std::sync::Arc::new(AtomicU64::new(1));
        let g = gen.clone();
        let server = std::thread::spawn(move || wait_for_callback(port, Duration::from_secs(10), &g, 1));
        let get = |path: &str| {
            for _ in 0..50 {
                if let Ok(mut s) = TcpStream::connect(("127.0.0.1", port)) {
                    s.write_all(format!("GET {path} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes()).unwrap();
                    let mut out = String::new();
                    s.read_to_string(&mut out).unwrap();
                    return out;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            panic!("could not connect");
        };
        assert!(get("/favicon.ico").starts_with("HTTP/1.1 404"));
        let ok = get("/callback?code=abc&state=s1");
        assert!(ok.starts_with("HTTP/1.1 200") && ok.contains("Connected to Dropbox"));
        let cb = server.join().unwrap().unwrap();
        assert_eq!((cb.code.as_deref(), cb.state.as_deref()), (Some("abc"), Some("s1")));
    }

    #[test]
    fn newer_generation_cancels_older_wait() {
        let port = 21000 + (std::process::id() % 20000) as u16;
        let gen = AtomicU64::new(2);
        let r = wait_for_callback(port, Duration::from_secs(10), &gen, 1);
        assert!(matches!(r, Err(AppError::OAuthTimeout)));
    }
}
