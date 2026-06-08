/**
 * First-run / recovery screen. Shown until a readable vault is loaded:
 *  - loading      → quiet spinner text
 *  - needs-vault  → welcome + "Choose your data folder"
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
  const chooseVault = useStore((s) => s.chooseVault);

  if (status === "loading") {
    return (
      <Centered>
        <div className="text-sm text-ink-3">Loading your data folder…</div>
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
