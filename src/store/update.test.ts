import { beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  relaunchApp: vi.fn(),
}));
vi.mock("@/lib/ipc", () => ipc);

import { useStore } from "./store";

describe("checkForUpdate", () => {
  beforeEach(() => {
    useStore.setState({ update: null });
    ipc.checkForUpdate.mockReset();
  });

  it("stays quiet when already up to date", async () => {
    ipc.checkForUpdate.mockResolvedValue(null);
    await useStore.getState().checkForUpdate();
    expect(useStore.getState().update).toBeNull();
  });

  it("downloads a found update, then offers the restart", async () => {
    let finish: () => void = () => {};
    const install = vi.fn(() => new Promise<void>((r) => (finish = r)));
    ipc.checkForUpdate.mockResolvedValue({ version: "9.9.9", install });
    const run = useStore.getState().checkForUpdate();
    await vi.waitFor(() => expect(install).toHaveBeenCalled());
    expect(useStore.getState().update).toEqual({ version: "9.9.9", phase: "downloading" });
    finish();
    await run;
    expect(useStore.getState().update).toEqual({ version: "9.9.9", phase: "ready" });
  });

  it("drops the update if the download fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    ipc.checkForUpdate.mockResolvedValue({ version: "9.9.9", install: () => Promise.reject(new Error("offline")) });
    await useStore.getState().checkForUpdate();
    expect(useStore.getState().update).toBeNull();
  });
});
