/**
 * Concurrency tests for the task-mutation seam (mutateTask / chained /
 * withSaveGuard) in store.ts — the bug fixes from the "deepen the store" pass:
 * (1) a stale snapshot can no longer drop one of two quick edits, and (2) the
 * focus-reload guard is a counter, so it stays raised until EVERY overlapping
 * save has finished, not just whichever one's `finally` ran first.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/types";

const ipc = vi.hoisted(() => ({
  updateTask: vi.fn(),
  loadAll: vi.fn(),
  createTask: vi.fn(),
}));
vi.mock("@/lib/ipc", () => ipc);

import { useStore } from "./store";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    context: "office",
    status: "open",
    created: "2026-09-01T09:00:00Z",
    due: null,
    snoozeUntil: null,
    completed: null,
    goalId: null,
    subtasks: [],
    details: "",
    priority: false,
    attachments: [],
    committedOn: null,
    carried: 0,
    ...overrides,
  };
}

beforeEach(() => {
  ipc.updateTask.mockReset();
  ipc.loadAll.mockReset();
});

describe("mutateTask serializes edits on the same task", () => {
  it("two concurrent patchTask calls both land, the second built on the first's result", async () => {
    // Keyed off CALL ORDER, not payload: the second call's task also carries
    // title "first" forward (that's the point being tested), so matching on
    // content would resolve the wrong promise.
    let resolveFirst: () => void = () => {};
    let calls = 0;
    ipc.updateTask.mockImplementation((t: Task) => {
      calls += 1;
      if (calls === 1) {
        return new Promise<Task>((resolve) => {
          resolveFirst = () => resolve(t);
        });
      }
      return Promise.resolve(t);
    });
    useStore.setState({ tasks: [task({ id: "t1" })] });

    const p1 = useStore.getState().patchTask("t1", { title: "first" });
    const p2 = useStore.getState().patchTask("t1", { priority: true });

    // The second edit must not even reach ipc until the first has resolved —
    // that's the serialization. (With the old stale-read bug, both would read
    // the original task and the second write would drop the first's title.)
    await vi.waitFor(() => expect(ipc.updateTask).toHaveBeenCalledTimes(1));
    expect(ipc.updateTask).toHaveBeenCalledWith(expect.objectContaining({ title: "first" }));

    resolveFirst();
    await p1;
    await p2;

    expect(ipc.updateTask).toHaveBeenCalledTimes(2);
    // The second ipc call was built on the first's persisted result, not a
    // snapshot taken before it.
    expect(ipc.updateTask).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "first", priority: true }),
    );

    const final = useStore.getState().tasks.find((t) => t.id === "t1");
    expect(final?.title).toBe("first");
    expect(final?.priority).toBe(true);
  });
});

describe("patchTask with a function of the latest task", () => {
  it("two rapid subtask appends both survive", async () => {
    useStore.setState({ tasks: [task()] });
    ipc.updateTask.mockImplementation(async (t: Task) => t);
    const add = (title: string) =>
      useStore.getState().patchTask("t1", (t) => ({
        subtasks: [...t.subtasks, { id: title, title, status: "open" as const }],
      }));
    await Promise.all([add("one"), add("two")]);
    const final = useStore.getState().tasks.find((t) => t.id === "t1");
    expect(final?.subtasks.map((s) => s.title)).toEqual(["one", "two"]);
  });

  it("two rapid priority toggles cancel out", async () => {
    useStore.setState({ tasks: [task({ priority: false })] });
    ipc.updateTask.mockImplementation(async (t: Task) => t);
    await Promise.all([
      useStore.getState().toggleTaskPriority("t1"),
      useStore.getState().toggleTaskPriority("t1"),
    ]);
    expect(ipc.updateTask.mock.calls.map(([t]) => (t as Task).priority)).toEqual([true, false]);
  });
});

describe("reload() and the in-flight save counter", () => {
  it("skips while two overlapping saves are in flight, and only proceeds once BOTH finish", async () => {
    let resolveA: () => void = () => {};
    let resolveB: () => void = () => {};
    let calls = 0;
    ipc.updateTask.mockImplementation((t: Task) => {
      calls += 1;
      if (calls === 1) return new Promise<Task>((r) => (resolveA = () => r(t)));
      return new Promise<Task>((r) => (resolveB = () => r(t)));
    });
    ipc.loadAll.mockResolvedValue({ tasks: [], notes: [], goals: [], notebooks: [] });
    useStore.setState({ tasks: [task({ id: "a" }), task({ id: "b" })] });

    // Different ids run concurrently (independent per-id chains).
    const p1 = useStore.getState().patchTask("a", { title: "A" });
    const p2 = useStore.getState().patchTask("b", { title: "B" });
    await vi.waitFor(() => expect(ipc.updateTask).toHaveBeenCalledTimes(2));

    await useStore.getState().reload();
    expect(ipc.loadAll).not.toHaveBeenCalled(); // both still in flight

    resolveA();
    await p1; // only the first finished — the second is still mid-flight

    await useStore.getState().reload();
    expect(ipc.loadAll).not.toHaveBeenCalled();

    resolveB();
    await p2;

    await useStore.getState().reload();
    expect(ipc.loadAll).toHaveBeenCalledTimes(1); // now both are done
  });
});

describe("addTask", () => {
  it("opens the new task's detail panel", async () => {
    useStore.setState({ tasks: [], detailTaskId: null });
    ipc.createTask.mockResolvedValue(task({ id: "new" }));
    await useStore.getState().addTask({ title: "Task", context: "office" });
    expect(useStore.getState().detailTaskId).toBe("new");
  });
});
