import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUndoSlice, UNDO_MS, type UndoToast } from "./undo";

function setup() {
  let state: { undoToast: UndoToast | null } = { undoToast: null };
  const slice = createUndoSlice(
    (p) => {
      state = { ...state, ...p };
    },
    () => state,
  );
  return { slice, toast: () => state.undoToast };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("undo slice", () => {
  it("shows a toast and expires it after UNDO_MS", () => {
    const { slice, toast } = setup();
    slice.showUndo({ label: "Task done", undo: vi.fn() });
    expect(toast()?.label).toBe("Task done");
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(toast()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(toast()).toBeNull();
  });

  it("a new toast replaces the old one and gets a fresh timer", () => {
    const { slice, toast } = setup();
    slice.showUndo({ label: "first", undo: vi.fn() });
    vi.advanceTimersByTime(UNDO_MS - 1000);
    slice.showUndo({ label: "second", undo: vi.fn() });
    vi.advanceTimersByTime(1000);
    expect(toast()?.label).toBe("second"); // the first timer must not clear it
    vi.advanceTimersByTime(UNDO_MS);
    expect(toast()).toBeNull();
  });

  it("runUndo runs the latest undo once and hides the toast", async () => {
    const { slice, toast } = setup();
    const first = vi.fn();
    const second = vi.fn();
    slice.showUndo({ label: "a", undo: first });
    slice.showUndo({ label: "b", undo: second });
    await slice.runUndo();
    await slice.runUndo();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(toast()).toBeNull();
  });

  it("dismiss hides without running", async () => {
    const { slice, toast } = setup();
    const undo = vi.fn();
    slice.showUndo({ label: "a", undo });
    slice.dismissUndo();
    await slice.runUndo();
    expect(undo).not.toHaveBeenCalled();
    expect(toast()).toBeNull();
  });

  it("an info toast has no undo and runUndo just hides it", async () => {
    const { slice, toast } = setup();
    slice.showUndo({ label: "Slate is full (5 of 5)" });
    expect(toast()?.run).toBeUndefined();
    await slice.runUndo();
    expect(toast()).toBeNull();
  });
});
