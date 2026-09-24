/**
 * Store-level attachment actions (store.ts: attachFilesToTask, attachPastedToTask,
 * removeTaskAttachment) — views no longer need to hand-roll the
 * ipc-then-patch sequence themselves.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment, Task } from "@/types";

const ipc = vi.hoisted(() => ({
  attachBytes: vi.fn(),
  attachFiles: vi.fn(),
  removeAttachment: vi.fn(),
  updateTask: vi.fn(),
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

function attachment(name: string): Attachment {
  return { path: `attachments/t1/${name}`, name, size: 3, added: "2026-09-24T00:00:00Z" };
}

beforeEach(() => {
  ipc.attachBytes.mockReset();
  ipc.attachFiles.mockReset();
  ipc.removeAttachment.mockReset();
  ipc.updateTask.mockReset().mockImplementation(async (t: Task) => t);
  useStore.setState({ tasks: [task()] });
});

describe("attachPastedToTask", () => {
  it("appends both pasted files, in order, without dropping the first", async () => {
    ipc.attachBytes.mockImplementation(async (_id: string, name: string) =>
      Promise.resolve(attachment(name)),
    );
    const a = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const b = new File([new Uint8Array([4, 5, 6])], "b.png", { type: "image/png" });

    await useStore.getState().attachPastedToTask("t1", [a, b], () => {});

    expect(ipc.attachBytes).toHaveBeenCalledTimes(2);
    const final = useStore.getState().tasks.find((t) => t.id === "t1");
    expect(final?.attachments.map((att) => att.name)).toEqual(["a.png", "b.png"]);
  });

  it("reports a failing file and still attaches the rest", async () => {
    ipc.attachBytes
      .mockRejectedValueOnce(new Error("disk full"))
      .mockImplementation(async (_id: string, name: string) => attachment(name));
    const a = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    const b = new File([new Uint8Array([2])], "b.png", { type: "image/png" });
    const errors: unknown[] = [];

    await useStore.getState().attachPastedToTask("t1", [a, b], (err) => errors.push(err));

    expect(errors).toHaveLength(1);
    const final = useStore.getState().tasks.find((t) => t.id === "t1");
    expect(final?.attachments.map((att) => att.name)).toEqual(["b.png"]);
  });
});

describe("attachFilesToTask", () => {
  it("copies files via ipc then appends the created records", async () => {
    ipc.attachFiles.mockResolvedValue([attachment("report.pdf")]);

    await useStore.getState().attachFilesToTask("t1", ["/Users/me/report.pdf"]);

    expect(ipc.attachFiles).toHaveBeenCalledWith("t1", ["/Users/me/report.pdf"]);
    const final = useStore.getState().tasks.find((t) => t.id === "t1");
    expect(final?.attachments.map((att) => att.name)).toEqual(["report.pdf"]);
  });
});

describe("removeTaskAttachment", () => {
  it("trashes the file via ipc then drops it from the task", async () => {
    useStore.setState({ tasks: [task({ attachments: [attachment("a.png"), attachment("b.png")] })] });
    ipc.removeAttachment.mockResolvedValue(undefined);

    await useStore.getState().removeTaskAttachment("t1", "attachments/t1/a.png");

    expect(ipc.removeAttachment).toHaveBeenCalledWith("attachments/t1/a.png");
    const final = useStore.getState().tasks.find((t) => t.id === "t1");
    expect(final?.attachments.map((att) => att.name)).toEqual(["b.png"]);
  });
});
