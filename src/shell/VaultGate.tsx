/**
 * First-run / recovery screen. Shown until a readable vault is loaded:
 *  - loading      → quiet spinner text
 *  - needs-vault  → first run: a welcome that walks through picking the data
 *                   folder (Finder opens in Documents → make a folder just for
 *                   the app → Open). Nothing else is reachable until a folder
 *                   is chosen, and closing the picker without one says so.
 *                   When a vault WAS configured but its folder is unreachable
 *                   (e.g. an unmounted drive): "Your data folder isn't
 *                   available" + the path + "Try again" / "Choose a different
 *                   folder" — never the first-run copy.
 *  - error        → the first-run walkthrough plus the message, so the user can pick again
 */
import { useState, type JSX, type ReactNode } from "react";
import { useStore } from "@/store";
import { Brand } from "./Brand";

function Centered({ children, wide = false }: { children: ReactNode; wide?: boolean }): JSX.Element {
  return (
    <div className="relative grid h-screen place-items-center overflow-y-auto bg-bg px-6 py-8 text-ink">
      {/* Draggable strip reserving the macOS traffic-light area before the shell mounts. */}
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-10" />
      <div className={`flex ${wide ? "max-w-md" : "max-w-sm"} flex-col items-center text-center`}>
        {children}
      </div>
    </div>
  );
}

/** The walkthrough. Its wording matches what `choose_vault`'s native picker shows. */
const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: "Click “Choose data folder” below",
    body: "A Finder window opens in your Documents folder.",
  },
  {
    title: "Make a folder just for the app",
    body: (
      <>
        Click <b className="font-semibold text-ink">New Folder</b> and name it “Notes &amp; Goals”.
        To use it on all your Macs, make it in iCloud Drive or Dropbox instead.
      </>
    ),
  },
  {
    title: "Select the new folder and click Open",
    body: "The app sets up its tasks, notes and goals inside it, and you’re in.",
  },
];

export function VaultGate(): JSX.Element {
  const status = useStore((s) => s.status);
  const errorMessage = useStore((s) => s.errorMessage);
  const missingVaultPath = useStore((s) => s.missingVaultPath);
  const chooseVault = useStore((s) => s.chooseVault);
  const init = useStore((s) => s.init);
  // Set when the picker closes without a folder, so the gate says why it's still here.
  const [pickerCancelled, setPickerCancelled] = useState(false);

  const pickFolder = async (): Promise<void> => {
    setPickerCancelled(false);
    await chooseVault();
    setPickerCancelled(useStore.getState().status === "needs-vault");
  };

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
    <Centered wide>
      <Brand />
      <h1 className="mt-4 font-serif text-2xl">Welcome to Notes &amp; Goals</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        Everything you create is kept as plain files in a data folder you choose, right on your
        Mac. Pick that folder once to get started.
      </p>

      <ol className="mt-6 w-full space-y-3.5 rounded-xl border border-line bg-surface p-4 text-left shadow-sm">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold tabular-nums text-accent-ink">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">{step.title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {status === "error" && errorMessage && (
        <p className="mt-4 w-full rounded-md bg-warn-soft px-3 py-2 text-sm text-warn-ink">
          {errorMessage}
        </p>
      )}
      {pickerCancelled && (
        <p role="status" className="mt-4 w-full rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn-ink">
          No folder chosen yet — the app needs one to save your work.
        </p>
      )}
      <button
        type="button"
        onClick={() => void pickFolder()}
        className="mt-5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-px"
      >
        Choose data folder…
      </button>
      <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
        Already use Notes &amp; Goals on another Mac? Choose the same synced folder.
        <br />
        You can switch to a different folder later in Settings (⌘,).
      </p>
    </Centered>
  );
}
