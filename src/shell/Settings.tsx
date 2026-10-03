/**
 * Settings — a centred modal for the app's few configurable things: where the
 * data folder lives, light/dark appearance, how many slots today's slate has,
 * and app info. Self-gating overlay
 * mounted beside the command palette (App.tsx): renders nothing while closed,
 * no exit-animation state machine, same as CommandPalette.
 */
import { useEffect, useState, type JSX } from "react";
import { useStore, MAX_SLATE_CAP, MIN_SLATE_CAP, type Theme } from "@/store";
import { Icon } from "@/components";
import { confirmDestructive } from "@/lib/confirm";
import { isTauri } from "@/lib/platform";
import { statusLine } from "@/sync/format";
import { syncController } from "@/sync";
import { DROPBOX_FOLDER } from "@/sync/config";

/** Where the phone app lives (the Pages site). */
const PHONE_APP_URL = "https://qriousguy.com/notes-goals-app/app/";

const REPO_URL = "https://github.com/Ashishjain608/notes-goals-app";
const THEMES: Theme[] = ["light", "dark"];

/**
 * Shorten a path under the home directory to a `~`-prefixed form, e.g.
 * `/Users/ash/Notes` + `/Users/ash` → `~/Notes`. Pure so it's unit-testable
 * without the path plugin; falls back to the full path when `home` is null
 * (homeDir() failed) or doesn't prefix `path`.
 */
export function shortenHome(path: string, home: string | null): string {
  if (!home) return path;
  if (path === home) return "~";
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

const STEP_BUTTON =
  "grid h-7 w-7 place-items-center rounded-md text-[16px] leading-none text-ink-2 transition-colors hover:bg-raise disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent";

function SectionHeading({ children }: { children: string }): JSX.Element {
  return (
    <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-ink-3">
      {children}
    </h2>
  );
}

export function Settings(): JSX.Element | null {
  const open = useStore((s) => s.settingsOpen);
  const close = useStore((s) => s.closeSettings);
  const vaultPath = useStore((s) => s.vaultPath);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const chooseVault = useStore((s) => s.chooseVault);
  const slateCap = useStore((s) => s.slateCap);
  const setSlateCap = useStore((s) => s.setSlateCap);

  const sync = useStore((s) => s.sync);
  const connecting = useStore((s) => s.syncConnecting);
  const connectDropbox = useStore((s) => s.connectDropbox);
  const cancelConnect = useStore((s) => s.cancelConnectDropbox);
  const disconnectDropbox = useStore((s) => s.disconnectDropbox);
  const syncNow = useStore((s) => s.syncNow);

  const [home, setHome] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch home dir + app version fresh each time the modal opens (cheap,
  // avoids stale state across a vault change). Mac only: the phone app has neither.
  useEffect(() => {
    if (!open) return;
    if (!isTauri) {
      void syncController.prepare(); // lets "Connect again" open its pop-up inside the tap
      return;
    }
    void (async () => {
      try {
        const [{ homeDir }, { getVersion }] = await Promise.all([
          import("@tauri-apps/api/path"),
          import("@tauri-apps/api/app"),
        ]);
        setHome(await homeDir().catch(() => null)); // fall back to showing the full path
        setVersion(await getVersion().catch(() => null));
      } catch {
        /* no Tauri runtime: leave both blank */
      }
    })();
  }, [open]);

  const openLink = async (url: string): Promise<void> => {
    if (!isTauri) return void window.open(url, "_blank", "noopener");
    (await import("@tauri-apps/plugin-opener")).openUrl(url).catch(() => {});
  };
  const copyLink = (): void => {
    void navigator.clipboard?.writeText(PHONE_APP_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const disconnect = async (): Promise<void> => {
    const message = isTauri
      ? "Disconnect Dropbox? Your data folder stays as it is; it just stops syncing."
      : "Disconnect Dropbox? This removes the notes from this phone. They stay in your Dropbox.";
    if (await confirmDestructive(message, "Disconnect")) await disconnectDropbox();
  };

  const connected = sync.phase !== "off";
  const revoked = sync.phase === "attention" && sync.message?.startsWith("Dropbox access was revoked") === true;
  const BUTTON =
    "rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-raise max-md:min-h-[44px] disabled:cursor-default disabled:opacity-40";

  // Escape closes from anywhere, not just when focus is inside it (same
  // pattern as TaskDetail).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const shownPath = vaultPath ? shortenHome(vaultPath, home) : "—";

  return (
    <div
      onClick={close}
      className="animate-overlayIn fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(20,18,15,.28)] backdrop-blur-[3px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ colorScheme: theme }}
        className="animate-riseIn w-[440px] max-w-[90vw] max-md:w-[calc(100vw-24px)] max-md:max-w-none overflow-hidden rounded-xl border border-line bg-surface shadow"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h1 className="flex-1 font-serif text-[19px] text-ink">Settings</h1>
          <button
            type="button"
            title="Close"
            onClick={close}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raise hover:text-ink-2"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="scroll max-h-[70vh] max-md:max-h-[80dvh] overflow-y-auto px-5 py-5 max-md:px-4">
          {isTauri && (
          <section className="mb-6">
            <SectionHeading>Data folder</SectionHeading>
            <p
              className="truncate rounded-md bg-raise px-3 py-2 font-mono text-[12.5px] text-ink-2"
              title={vaultPath ?? undefined}
            >
              {shownPath}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void chooseVault()}
                className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-raise"
              >
                Change folder…
              </button>
              <button
                type="button"
                title={vaultPath ? undefined : "No data folder yet"}
                disabled={!vaultPath}
                onClick={() => vaultPath && void import("@tauri-apps/plugin-opener").then((m) => m.revealItemInDir(vaultPath))}
                className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-raise disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Reveal in Finder
              </button>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
              Tasks, notes, and goals live there as plain files. Pick a folder inside iCloud
              Drive or Dropbox to sync across your Macs.
            </p>
          </section>
          )}

          <section className="mb-6">
            <SectionHeading>Sync</SectionHeading>
            {!connected && !connecting && (
              <>
                <p className="text-[13px] leading-relaxed text-ink-2">
                  Keep your notes in your own Dropbox and use them on your phone. They go into one
                  folder, {DROPBOX_FOLDER}; the app can&rsquo;t see anything else.
                </p>
                {sync.message && (
                  <p role="alert" className="mt-2.5 rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn-ink">
                    {sync.message}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void connectDropbox()}
                  className="mt-3 rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm max-md:min-h-[44px]"
                >
                  Connect Dropbox
                </button>
              </>
            )}
            {connecting && (
              <div className="flex items-center gap-3">
                <p className="flex-1 text-[13px] text-ink-2">Finish in your browser…</p>
                <button type="button" onClick={cancelConnect} className={BUTTON}>
                  Cancel
                </button>
              </div>
            )}
            {connected && !connecting && (
              <>
                <p className="truncate text-[13px] font-medium text-ink" title={sync.account?.email}>
                  {sync.account?.email ?? "Dropbox"}
                </p>
                <p
                  aria-live="polite"
                  className={`mt-0.5 text-[13px] ${
                    sync.phase === "attention" || sync.phase === "error" ? "text-warn-ink" : "text-ink-2"
                  }`}
                >
                  {statusLine(sync)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {revoked && (
                    <button
                      type="button"
                      onClick={() => void connectDropbox()}
                      className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm max-md:min-h-[44px]"
                    >
                      Connect again
                    </button>
                  )}
                  <button type="button" disabled={sync.phase === "syncing"} onClick={() => void syncNow()} className={BUTTON}>
                    Sync now
                  </button>
                  <button type="button" onClick={() => void disconnect()} className={BUTTON}>
                    Disconnect
                  </button>
                </div>
              </>
            )}
            {isTauri && (
              <div className="mt-4 border-t border-line pt-3.5">
                <p className="text-[13px] font-medium text-ink">Use it on your phone</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate rounded-md bg-raise px-3 py-2 font-mono text-[12px] text-ink-2" title={PHONE_APP_URL}>
                    {PHONE_APP_URL}
                  </p>
                  <button type="button" onClick={copyLink} className={BUTTON}>
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
                  Open it in Safari, tap Share, then Add to Home Screen. Connect the same Dropbox there.
                </p>
              </div>
            )}
          </section>

          <section className="mb-6">
            <SectionHeading>Appearance</SectionHeading>
            <div className="inline-flex rounded-lg border border-line p-0.5">
              {THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`rounded-md px-3 py-1 text-[13px] font-medium capitalize transition-colors ${
                    theme === t ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-raise"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          <section className="mb-6">
            <SectionHeading>Today&rsquo;s slate</SectionHeading>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center rounded-lg border border-line p-0.5">
                <button
                  type="button"
                  aria-label="One fewer slot"
                  title={
                    slateCap <= MIN_SLATE_CAP
                      ? `At least ${MIN_SLATE_CAP} slot`
                      : `One fewer slot — Today holds ${slateCap - 1}`
                  }
                  disabled={slateCap <= MIN_SLATE_CAP}
                  onClick={() => setSlateCap(slateCap - 1)}
                  className={STEP_BUTTON}
                >
                  &minus;
                </button>
                <span
                  aria-live="polite"
                  className="w-8 text-center text-[14px] font-medium tabular-nums text-ink"
                >
                  {slateCap}
                </span>
                <button
                  type="button"
                  aria-label="One more slot"
                  title={
                    slateCap >= MAX_SLATE_CAP
                      ? `At most ${MAX_SLATE_CAP} slots`
                      : `One more slot — Today holds ${slateCap + 1}`
                  }
                  disabled={slateCap >= MAX_SLATE_CAP}
                  onClick={() => setSlateCap(slateCap + 1)}
                  className={STEP_BUTTON}
                >
                  +
                </button>
              </div>
              <span className="text-[13px] text-ink-2">
                {slateCap === 1 ? "task" : "tasks"} you can commit to each day
              </span>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
              A small slate is a day you can finish. Lowering it keeps what you&rsquo;ve already
              committed today; it only stops new commitments. Saved on {isTauri ? "this Mac" : "this phone"}.
            </p>
          </section>

          <section>
            <SectionHeading>About</SectionHeading>
            <p className="text-[13px] text-ink-2">
              Notes &amp; Goals{version ? ` v${version}` : ""} · MIT licensed
            </p>
            <button
              type="button"
              onClick={() => void openLink(REPO_URL)}
              className="mt-1.5 text-[13px] font-medium text-accent hover:underline"
            >
              Source on GitHub
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
