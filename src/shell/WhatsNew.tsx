/**
 * WhatsNew — a one-time card after an update that brings something worth
 * knowing (Mac only). It shows when the app opens straight into an existing
 * data folder on a version whose notes this Mac hasn't seen yet; a fresh
 * install just records the version. Self-gating overlay mounted beside
 * Settings (App.tsx), same pattern: renders nothing while closed.
 */
import { useEffect, useState, type JSX } from "react";
import { Icon, type IconName } from "@/components";
import { isTauri } from "@/lib/platform";
import { useStore } from "@/store";
import { DROPBOX_FOLDER } from "@/sync/config";

interface ReleaseNotes {
  headline: string;
  points: { icon: IconName; title: string; body: string }[];
  /** The plain promise about the user's data, set apart so it can't be missed. */
  privacy?: { lead: string; body: string };
}

// ponytail: only the current version's notes show; someone skipping a version misses its card. Chain them if that matters.
export const RELEASE_NOTES: Record<string, ReleaseNotes> = {
  "0.4.0": {
    headline: "Your notes and goals, now on your phone",
    points: [
      {
        icon: "cloudCheck",
        title: "Sync with your Dropbox",
        body: "Connect it in Settings → Sync. Your Mac keeps your data folder and Dropbox identical, and shows how long each sync takes.",
      },
      {
        icon: "phone",
        title: "The phone app",
        body: "Open qriousguy.com/notes-goals-app/app on your iPhone or Android and add it to your Home Screen. Tasks, notes and goals, all there.",
      },
    ],
    privacy: {
      lead: "It's your Dropbox, not ours.",
      body: `Your notes travel straight between your devices and the ${DROPBOX_FOLDER} folder in your own Dropbox. There's no Notes & Goals server in between, so we never see, store or hold any of your data.`,
    },
  },
};

const SEEN_KEY = "ng-whats-new-seen";

/** Pure: show this version's card? Only to someone who already had the app, once per version. */
export function shouldShowWhatsNew(seen: string | null, current: string, openedExistingFolder: boolean): boolean {
  return openedExistingFolder && seen !== current && current in RELEASE_NOTES;
}

// Did this launch open straight into a data folder (an existing user), or go through choosing one?
let openedExistingFolder: boolean | null = null;
useStore.subscribe((s) => {
  if (openedExistingFolder === null && s.status !== "loading") openedExistingFolder = s.status === "ready";
});

export function WhatsNew(): JSX.Element | null {
  const openSettings = useStore((s) => s.openSettings);
  const theme = useStore((s) => s.theme);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    void (async () => {
      const current = await (await import("@tauri-apps/api/app")).getVersion().catch(() => null);
      if (!current) return;
      let seen: string | null = null;
      try {
        seen = localStorage.getItem(SEEN_KEY);
        localStorage.setItem(SEEN_KEY, current);
      } catch {
        return; // storage blocked: better silent than shown on every launch
      }
      if (shouldShowWhatsNew(seen, current, openedExistingFolder === true)) setVersion(current);
    })();
  }, []);

  const close = (): void => setVersion(null);
  useEffect(() => {
    if (!version) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [version]);

  const notes = version ? RELEASE_NOTES[version] : undefined;
  if (!version || !notes) return null;

  return (
    <div
      onClick={close}
      className="animate-overlayIn fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(20,18,15,.28)] backdrop-blur-[3px]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        onClick={(e) => e.stopPropagation()}
        style={{ colorScheme: theme }}
        className="animate-riseIn w-[460px] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-surface shadow"
      >
        <div className="px-6 pt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[.06em] text-accent">What's new in {version}</p>
          <h1 id="whats-new-title" className="mt-1.5 font-serif text-[22px] leading-tight text-ink">
            {notes.headline}
          </h1>
        </div>

        <ul className="space-y-4 px-6 pt-5">
          {notes.points.map((p) => (
            <li key={p.title} className="flex gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-raise text-ink-2">
                <Icon name={p.icon} size={17} />
              </span>
              <div>
                <p className="text-[14px] font-medium text-ink">{p.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>

        {notes.privacy && (
          <div className="mx-6 mt-5 flex gap-3 rounded-lg border border-line bg-raise px-4 py-3.5">
            <Icon name="lock" size={17} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[13px] leading-relaxed text-ink-2">
              <b className="font-semibold text-ink">{notes.privacy.lead}</b> {notes.privacy.body}
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-line px-3.5 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-raise"
          >
            Later
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => {
              close();
              openSettings();
            }}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:opacity-90"
          >
            Set up sync
          </button>
        </div>
      </div>
    </div>
  );
}
