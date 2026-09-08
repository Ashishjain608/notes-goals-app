/**
 * Settings — a centred modal for the app's few configurable things: where the
 * data folder lives, light/dark appearance, and app info. Self-gating overlay
 * mounted beside the command palette (App.tsx): renders nothing while closed,
 * no exit-animation state machine, same as CommandPalette.
 */
import { useEffect, useState, type JSX } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useStore, type Theme } from "@/store";
import { Icon } from "@/components";

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

  const [home, setHome] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  // Fetch home dir + app version fresh each time the modal opens (cheap,
  // avoids stale state across a vault change).
  useEffect(() => {
    if (!open) return;
    homeDir()
      .then(setHome)
      .catch(() => setHome(null)); // fall back to showing the full path
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, [open]);

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
        className="animate-riseIn w-[440px] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-surface shadow"
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

        <div className="scroll max-h-[70vh] overflow-y-auto px-5 py-5">
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
                onClick={() => vaultPath && void revealItemInDir(vaultPath)}
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

          <section>
            <SectionHeading>About</SectionHeading>
            <p className="text-[13px] text-ink-2">
              Notes &amp; Goals{version ? ` v${version}` : ""} · MIT licensed
            </p>
            <button
              type="button"
              onClick={() => void openUrl(REPO_URL)}
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
