/**
 * PhoneOnboarding — first run of the phone app (docs/adr/0011), shown instead
 * of VaultGate when the browser has no local copy yet:
 *   (a) iOS Safari outside the Home Screen: how to add it (skippable),
 *   (b) "Where are your notes?": connect Dropbox (pop-up, or paste a code),
 *   (c) the first sync, with progress, then into the app.
 */
import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { errorMessageOf } from "@/lib/errors";
import { useStore } from "@/store";
import { syncController } from "@/sync";
import { DROPBOX_FOLDER } from "@/sync/config";
import { Brand } from "./Brand";

type Step = "install" | "dropbox" | "syncing";

const IS_IOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
const standalone = (): boolean => (navigator as { standalone?: boolean }).standalone === true;

const PRIMARY =
  "w-full rounded-lg bg-accent px-5 py-3 text-[15px] font-semibold text-white shadow-sm disabled:opacity-50";
const QUIET = "min-h-[44px] px-3 text-[13px] font-medium text-ink-3 underline underline-offset-2";

function Screen({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="grid h-[100dvh] place-items-center overflow-y-auto bg-bg px-6 py-8 pt-[max(2rem,env(safe-area-inset-top))] text-ink">
      <div className="flex w-full max-w-sm flex-col items-center text-center">{children}</div>
    </div>
  );
}

function Warn({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p role="alert" className="mt-4 w-full rounded-md bg-warn-soft px-3 py-2 text-left text-[13px] text-warn-ink">
      {children}
    </p>
  );
}

export function PhoneOnboarding(): JSX.Element {
  const init = useStore((s) => s.init);
  const [step, setStep] = useState<Step>(IS_IOS && !standalone() ? "install" : "dropbox");
  const [ready, setReady] = useState(syncController.isPrepared());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [code, setCode] = useState("");
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const booted = useRef(false);
  const syncStarted = useRef(false);

  // The PKCE pair must exist before the tap so the pop-up can open synchronously.
  useEffect(() => {
    void syncController.prepare().then(() => setReady(true));
  }, []);

  // Back from a same-window sign-in, or reopened mid-way: skip ahead.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      try {
        if (await syncController.finishRedirect()) setStep("syncing");
        else if (syncController.hasRecord()) setStep("syncing");
      } catch (e) {
        setError(errorMessageOf(e));
        setStep("dropbox");
      }
    })();
  }, []);

  const runFirstSync = async (): Promise<void> => {
    setError(null);
    setProgress(null);
    try {
      await syncController.firstSync((done, total) => setProgress([done, total]));
      try {
        localStorage.setItem("ng-web-vault", "dropbox");
      } catch {
        /* storage blocked: the app will ask again next visit */
      }
      void navigator.storage?.persist?.();
      await init();
    } catch (e) {
      setError(errorMessageOf(e));
    }
  };

  useEffect(() => {
    if (step !== "syncing" || syncStarted.current) return;
    syncStarted.current = true;
    void runFirstSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /** Runs inside the tap: no await may come before the pop-up opens. */
  const connect = (): void => {
    setBusy(true);
    setError(null);
    syncController
      .connect()
      .then(() => setStep("syncing"))
      .catch((e: unknown) => setError(errorMessageOf(e)))
      .finally(() => setBusy(false));
  };
  const cancel = (): void => {
    syncController.cancelConnect();
    setBusy(false);
  };
  const submitCode = (): void => {
    setBusy(true);
    setError(null);
    syncController
      .connectWithCode(code)
      .then(() => setStep("syncing"))
      .catch((e: unknown) => setError(errorMessageOf(e)))
      .finally(() => setBusy(false));
  };

  if (step === "install") {
    return (
      <Screen>
        <Brand />
        <h1 className="mt-4 font-serif text-2xl">Add it to your Home Screen</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Notes &amp; Goals works best as an app on your phone, and it keeps your notes on this phone.
        </p>
        <ol className="mt-6 w-full space-y-3.5 rounded-xl border border-line bg-surface p-4 text-left shadow-sm">
          <li className="text-[14px] text-ink-2">
            <b className="font-semibold text-ink">1.</b> Tap the Share button in Safari&rsquo;s toolbar.
          </li>
          <li className="text-[14px] text-ink-2">
            <b className="font-semibold text-ink">2.</b> Choose <b className="font-semibold text-ink">Add to Home Screen</b>.
          </li>
          <li className="text-[14px] text-ink-2">
            <b className="font-semibold text-ink">3.</b> Open Notes &amp; Goals from your Home Screen.
          </li>
        </ol>
        <button type="button" onClick={() => setStep("dropbox")} className={`mt-4 ${QUIET}`}>
          Continue in the browser
        </button>
      </Screen>
    );
  }

  if (step === "syncing") {
    const [done, total] = progress ?? [0, 0];
    return (
      <Screen>
        <Brand />
        <h1 className="mt-4 font-serif text-2xl">Getting your notes</h1>
        {error ? (
          <>
            <Warn>{error}</Warn>
            <button
              type="button"
              onClick={() => void runFirstSync()}
              className={`mt-5 ${PRIMARY}`}
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <p role="status" className="mt-3 text-sm text-ink-2">
              {total > 0 ? `Downloading your notes… ${done} of ${total}` : "Checking your Dropbox…"}
            </p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-raise">
              <div
                className="h-full bg-accent transition-[width] duration-300"
                style={{ width: total > 0 ? `${Math.round((done / total) * 100)}%` : "8%" }}
              />
            </div>
          </>
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Brand />
      <h1 className="mt-4 font-serif text-2xl">Where are your notes?</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        Your notes stay in your own Dropbox, in one folder ({DROPBOX_FOLDER}). The app can&rsquo;t see
        anything else there.
      </p>
      {error && <Warn>{error}</Warn>}
      {busy && !pasting ? (
        <>
          <p role="status" className="mt-6 text-sm text-ink-2">Finish in the Dropbox window…</p>
          <button type="button" onClick={cancel} className={`mt-2 ${QUIET}`}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button type="button" disabled={!ready} onClick={connect} className={`mt-6 ${PRIMARY}`}>
            Continue with Dropbox
          </button>
          {!pasting ? (
            <button type="button" onClick={() => setPasting(true)} className={`mt-1 ${QUIET}`}>
              Paste a code instead
            </button>
          ) : (
            <div className="mt-4 w-full rounded-xl border border-line bg-surface p-4 text-left">
              <p className="text-[13px] leading-snug text-ink-2">
                Open Dropbox, allow access, then paste the code it shows here.
              </p>
              <button
                type="button"
                disabled={!ready}
                onClick={() => {
                  try {
                    syncController.startCodeFlow();
                  } catch (e) {
                    setError(errorMessageOf(e));
                  }
                }}
                className="mt-2.5 min-h-[44px] w-full rounded-lg border border-line text-[14px] font-medium text-ink-2"
              >
                Open Dropbox
              </button>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste the code"
                aria-label="Dropbox code"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="mt-2.5 min-h-[44px] w-full rounded-lg border border-line bg-bg px-3 text-base text-ink outline-none"
              />
              <button
                type="button"
                disabled={busy || !code.trim()}
                onClick={submitCode}
                className={`mt-2.5 ${PRIMARY}`}
              >
                Connect
              </button>
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
