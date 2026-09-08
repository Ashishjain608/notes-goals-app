import { confirm } from "@tauri-apps/plugin-dialog";

/** Native macOS confirmation sheet. Resolves true only when the user picks the destructive action. */
export async function confirmDestructive(message: string, okLabel = "Delete"): Promise<boolean> {
  return confirm(message, { title: "Notes & Goals", kind: "warning", okLabel, cancelLabel: "Cancel" });
}
