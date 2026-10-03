import { isTauri } from "@/lib/platform";

/** Confirmation for a destructive action: the native macOS sheet, or window.confirm in the phone app. Resolves true only when the user picks the destructive action. */
export async function confirmDestructive(message: string, okLabel = "Delete"): Promise<boolean> {
  if (!isTauri) return window.confirm(message);
  const { confirm } = await import("@tauri-apps/plugin-dialog");
  return confirm(message, { title: "Notes & Goals", kind: "warning", okLabel, cancelLabel: "Cancel" });
}
