import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/types";

// The store reads the saved cap when the module loads, so storage must exist first.
const storage = vi.hoisted(() => {
  const map = new Map<string, string>([["ng-slate-cap", "3"]]);
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  (globalThis as { localStorage?: unknown }).localStorage = store;
  return map;
});

const ipc = vi.hoisted(() => ({ updateTask: vi.fn(async (t: unknown) => t) }));
vi.mock("@/lib/ipc", () => ipc);

import { useStore } from "./store";
import { localToday } from "@/lib/dates";

function task(id: string, committedOn: string | null = null): Task {
  return {
    id,
    title: id,
    details: "",
    status: "open",
    context: "office",
    priority: false,
    due: null,
    snoozeUntil: null,
    goalId: null,
    subtasks: [],
    attachments: [],
    created: "2026-09-01T09:00:00Z",
    completed: null,
    committedOn,
    carried: 0,
  };
}

describe("slate cap setting", () => {
  it("starts from the value saved on this Mac", () => {
    expect(useStore.getState().slateCap).toBe(3);
  });

  it("persists a new cap, clamped to the allowed range", () => {
    useStore.getState().setSlateCap(7);
    expect(useStore.getState().slateCap).toBe(7);
    expect(storage.get("ng-slate-cap")).toBe("7");

    useStore.getState().setSlateCap(0);
    expect(useStore.getState().slateCap).toBe(1);
    useStore.getState().setSlateCap(50);
    expect(useStore.getState().slateCap).toBe(10);
    expect(storage.get("ng-slate-cap")).toBe("10");
  });
});

describe("toggleTaskCommit honours the chosen cap", () => {
  beforeEach(() => ipc.updateTask.mockClear());

  it("refuses the commit that would exceed the cap, and allows it once raised", async () => {
    const today = localToday();
    useStore.setState({ tasks: [task("a", today), task("b", today), task("c")] });

    useStore.getState().setSlateCap(2);
    expect(await useStore.getState().toggleTaskCommit("c")).toBe(false);
    expect(ipc.updateTask).not.toHaveBeenCalled();

    useStore.getState().setSlateCap(3);
    expect(await useStore.getState().toggleTaskCommit("c")).toBe(true);
    expect(useStore.getState().tasks.find((t) => t.id === "c")?.committedOn).toBe(today);
  });

  it("still lets you take a task off a slate that is over a lowered cap", async () => {
    const today = localToday();
    useStore.setState({ tasks: [task("a", today), task("b", today), task("c", today)] });
    useStore.getState().setSlateCap(1);

    expect(await useStore.getState().toggleTaskCommit("a")).toBe(true);
    expect(useStore.getState().tasks.find((t) => t.id === "a")?.committedOn).toBeNull();
  });
});
