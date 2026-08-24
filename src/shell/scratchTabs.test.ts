/**
 * Unit tests for the pure scratchpad tab-state module. No DOM: a fake
 * in-memory storage stands in for localStorage.
 */
import { describe, expect, it } from "vitest";
import {
  LEGACY_TEXT_KEY,
  STATE_KEY,
  activeTab,
  addTab,
  closeTab,
  loadState,
  nextTab,
  nthTab,
  prevTab,
  renameTab,
  saveState,
  setTabText,
  switchTab,
  tabTitle,
  type ScratchStorage,
} from "./scratchTabs";

/** A minimal in-memory Storage stand-in for tests. */
function fakeStorage(initial: Record<string, string> = {}): ScratchStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

describe("loadState migration", () => {
  it("migrates legacy ng-scratch text into the first tab", () => {
    const storage = fakeStorage({ [LEGACY_TEXT_KEY]: "my old notes" });
    const state = loadState(storage);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.text).toBe("my old notes");
    expect(state.activeId).toBe(state.tabs[0]?.id);
  });

  it("does not migrate twice once the tabbed key is persisted", () => {
    const storage = fakeStorage({ [LEGACY_TEXT_KEY]: "my old notes" });
    const first = loadState(storage);
    // Mutate legacy key after migration to prove it's never consulted again.
    storage.setItem(LEGACY_TEXT_KEY, "different text");
    const second = loadState(storage);
    expect(second).toEqual(first);
    expect(second.tabs[0]?.text).toBe("my old notes");
  });

  it("starts fresh with one empty tab when nothing is stored", () => {
    const state = loadState(fakeStorage());
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.text).toBe("");
  });

  it("falls back cleanly when the tabbed key holds corrupt JSON", () => {
    const storage = fakeStorage({ [STATE_KEY]: "{not json" });
    const state = loadState(storage);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.text).toBe("");
  });

  it("falls back cleanly when the tabbed key holds a malformed shape", () => {
    const storage = fakeStorage({ [STATE_KEY]: JSON.stringify({ tabs: [] }) });
    const state = loadState(storage);
    expect(state.tabs).toHaveLength(1);
  });
});

describe("tabTitle", () => {
  it("auto-titles from the first non-empty line", () => {
    const tab = { id: "a", text: "\n  first real line  \nsecond line", manualTitle: null };
    expect(tabTitle(tab)).toBe("first real line");
  });

  it("falls back to Untitled for an empty tab", () => {
    expect(tabTitle({ id: "a", text: "", manualTitle: null })).toBe("Untitled");
    expect(tabTitle({ id: "a", text: "\n \n", manualTitle: null })).toBe("Untitled");
  });

  it("truncates a long first line", () => {
    const long = "x".repeat(80);
    const title = tabTitle({ id: "a", text: long, manualTitle: null });
    expect(title.length).toBeLessThan(80);
    expect(title.endsWith("…")).toBe(true);
  });

  it("keeps a manual rename and stops auto-titling", () => {
    const storage = fakeStorage();
    let state = loadState(storage);
    const id = state.activeId;
    state = renameTab(state, id, "My Tab");
    state = setTabText(state, id, "some new first line");
    expect(tabTitle(activeTab(state))).toBe("My Tab");
  });

  it("clears a manual title back to auto when renamed blank", () => {
    const storage = fakeStorage();
    let state = loadState(storage);
    const id = state.activeId;
    state = renameTab(state, id, "My Tab");
    state = renameTab(state, id, "   ");
    state = setTabText(state, id, "auto again");
    expect(tabTitle(activeTab(state))).toBe("auto again");
  });
});

describe("closeTab", () => {
  it("leaves one empty tab when closing the last remaining tab", () => {
    const storage = fakeStorage();
    let state = loadState(storage);
    const id = state.activeId;
    state = closeTab(state, id);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.text).toBe("");
    expect(state.activeId).toBe(state.tabs[0]?.id);
  });

  it("picks a sensible neighbor as active when closing the active tab", () => {
    let state = loadState(fakeStorage());
    state = addTab(state);
    state = addTab(state);
    const [first, second, third] = state.tabs;
    state = switchTab(state, second!.id);
    state = closeTab(state, second!.id);
    expect(state.tabs.map((t) => t.id)).toEqual([first!.id, third!.id]);
    expect(state.activeId).toBe(third!.id);
  });

  it("leaves the active tab untouched when closing a different tab", () => {
    let state = loadState(fakeStorage());
    state = addTab(state);
    const [first, second] = state.tabs;
    state = switchTab(state, second!.id);
    state = closeTab(state, first!.id);
    expect(state.activeId).toBe(second!.id);
    expect(state.tabs).toHaveLength(1);
  });
});

describe("addTab / switchTab / setTabText", () => {
  it("adds a new active empty tab", () => {
    let state = loadState(fakeStorage());
    const before = state.tabs.length;
    state = addTab(state);
    expect(state.tabs).toHaveLength(before + 1);
    expect(state.activeId).toBe(state.tabs[state.tabs.length - 1]?.id);
  });

  it("switchTab is a no-op for an unknown id", () => {
    const state = loadState(fakeStorage());
    const next = switchTab(state, "nope");
    expect(next).toBe(state);
  });

  it("setTabText only updates the targeted tab", () => {
    let state = loadState(fakeStorage());
    state = addTab(state);
    const [first, second] = state.tabs;
    state = setTabText(state, first!.id, "hello");
    expect(activeTab(state).text).toBe(""); // active is still `second`, untouched
    expect(state.tabs.find((t) => t.id === first!.id)?.text).toBe("hello");
    expect(state.tabs.find((t) => t.id === second!.id)?.text).toBe("");
  });
});

describe("nextTab / prevTab", () => {
  it("advances to the next tab and wraps from the last back to the first", () => {
    let state = loadState(fakeStorage());
    state = addTab(state);
    state = addTab(state);
    const [first, second, third] = state.tabs;
    state = switchTab(state, first!.id);
    state = nextTab(state);
    expect(state.activeId).toBe(second!.id);
    state = nextTab(state);
    expect(state.activeId).toBe(third!.id);
    state = nextTab(state);
    expect(state.activeId).toBe(first!.id);
  });

  it("goes to the previous tab and wraps from the first back to the last", () => {
    let state = loadState(fakeStorage());
    state = addTab(state);
    state = addTab(state);
    const [first, second, third] = state.tabs;
    state = switchTab(state, first!.id);
    state = prevTab(state);
    expect(state.activeId).toBe(third!.id);
    state = prevTab(state);
    expect(state.activeId).toBe(second!.id);
    state = prevTab(state);
    expect(state.activeId).toBe(first!.id);
  });

  it("is a no-op on a single tab", () => {
    const state = loadState(fakeStorage());
    expect(nextTab(state)).toEqual(state);
    expect(prevTab(state)).toEqual(state);
  });
});

describe("nthTab", () => {
  it("jumps to the tab at the given 1-based position", () => {
    let state = loadState(fakeStorage());
    state = addTab(state);
    state = addTab(state);
    const [first, , third] = state.tabs;
    expect(nthTab(state, 1).activeId).toBe(first!.id);
    expect(nthTab(state, 3).activeId).toBe(third!.id);
  });

  it("treats 9 as 'last tab' regardless of tab count", () => {
    let state = loadState(fakeStorage());
    state = addTab(state);
    const [, second] = state.tabs;
    expect(nthTab(state, 9).activeId).toBe(second!.id);
  });

  it("is a no-op for an in-range-but-missing position below 9", () => {
    const state = loadState(fakeStorage());
    expect(nthTab(state, 5)).toBe(state);
  });

  it("is a no-op for position 0 or negative", () => {
    const state = loadState(fakeStorage());
    expect(nthTab(state, 0)).toBe(state);
    expect(nthTab(state, -1)).toBe(state);
  });

  it("resolves to the only tab on a single-tab state for both 1 and 9", () => {
    const state = loadState(fakeStorage());
    expect(nthTab(state, 1).activeId).toBe(state.activeId);
    expect(nthTab(state, 9).activeId).toBe(state.activeId);
  });
});

describe("saveState / loadState round-trip", () => {
  it("persists and reloads identical state", () => {
    const storage = fakeStorage();
    let state = loadState(storage);
    state = addTab(state);
    state = setTabText(state, state.activeId, "round trip");
    saveState(storage, state);
    const reloaded = loadState(storage);
    expect(reloaded).toEqual(state);
  });
});
