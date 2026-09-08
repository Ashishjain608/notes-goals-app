/**
 * First-run / recovery screen. Shown until a readable vault is loaded:
 *  - loading      → quiet spinner text
 *  - needs-vault  → welcome + "Choose your data folder" (first run), or, when
 *                   a vault WAS configured but its folder is unreachable
 *                   (e.g. an unmounted drive), "Your data folder isn't
 *                   available" + the path + "Try again" / "Choose a
 *                   different folder" — never the first-run copy.
 *  - error        → message + retry (e.g. the folder moved/was unmounted)
 */
import { useStore } from "@/store";
import { Brand } from "./Brand";

function Centered({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="relative grid h-screen place-items-center bg-bg px-6 text-ink">
      {/* Draggable strip reserving the macOS traffic-light area before the shell mounts. */}
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-10" />
      <div className="flex max-w-sm flex-col items-center text-center">{children}</div>
    </div>
  );
}

export function VaultGate(): JSX.Element {
  const status = useStore((s) => s.status);
  const errorMessage = useStore((s) => s.errorMessage);
  const missingVaultPath = useStore((s) => s.missingVaultPath);
  const chooseVault = useStore((s) => s.chooseVault);
  const init = useStore((s) => s.init);

  if (status === "loading") {
    return (
      <Centered>
        <div className="text-sm text-ink-3">Loading your data folder…</div>
      </Centered>
    );
  }

  if (status === "needs-vault" && missingVaultPath) {
    return (
      <Centered>
        <Brand />
        <h1 className="mt-4 font-serif text-2xl">Your data folder isn&apos;t available</h1>
        <p className="mt-2 truncate text-sm text-ink-2" title={missingVaultPath}>
          {missingVaultPath}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          It may be on a drive that&apos;s unplugged or unmounted right now.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => void init()}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-px"
          >
            Try again
          </button>
          <button
            onClick={() => void chooseVault()}
            className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-raise"
          >
            Choose a different folder
          </button>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <Brand />
      <h1 className="mt-4 font-serif text-2xl">Notes &amp; Goals</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        Choose a folder to keep your tasks, notes, and goals. Everything stays as plain files on
        your Mac — portable, backup-friendly, and yours.
      </p>
      {status === "error" && errorMessage && (
        <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn-ink">{errorMessage}</p>
      )}
      <button
        onClick={() => void chooseVault()}
        className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-px"
      >
        Choose your data folder
      </button>
    </Centered>
  );
}
