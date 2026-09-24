import { describe, expect, it } from "vitest";
import type { PrefsStorage } from "./prefs";
import {
  readJson,
  readNavCollapsed,
  readSlateCap,
  readTheme,
  writeJson,
  writeNavCollapsed,
  writeSlateCap,
  writeTheme,
} from "./prefs";

/** An in-memory stand-in for localStorage, passed explicitly — no global mutation needed. */
function fakeStorage(seed: Record<string, string> = {}): PrefsStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe("theme", () => {
  it("defaults to light", () => {
    expect(readTheme(fakeStorage())).toBe("light");
  });

  it("round-trips under the unchanged 'ng-theme' key", () => {
    const storage = fakeStorage();
    writeTheme("dark", storage);
    expect(storage.data.get("ng-theme")).toBe("dark");
    expect(readTheme(storage)).toBe("dark");
  });

  it("treats anything but 'dark' as light", () => {
    expect(readTheme(fakeStorage({ "ng-theme": "sepia" }))).toBe("light");
  });
});

describe("navCollapsed", () => {
  it("defaults to false and round-trips under 'ng-nav-collapsed' as '1'/'0'", () => {
    const storage = fakeStorage();
    expect(readNavCollapsed(storage)).toBe(false);
    writeNavCollapsed(true, storage);
    expect(storage.data.get("ng-nav-collapsed")).toBe("1");
    expect(readNavCollapsed(storage)).toBe(true);
    writeNavCollapsed(false, storage);
    expect(storage.data.get("ng-nav-collapsed")).toBe("0");
    expect(readNavCollapsed(storage)).toBe(false);
  });
});

describe("slateCap", () => {
  it("defaults to 5 and clamps on both read and write, under 'ng-slate-cap'", () => {
    expect(readSlateCap(fakeStorage())).toBe(5);

    const storage = fakeStorage({ "ng-slate-cap": "99" });
    expect(readSlateCap(storage)).toBe(10); // a hand-edited value can't break the slate

    writeSlateCap(0, storage);
    expect(storage.data.get("ng-slate-cap")).toBe("1");
  });
});

describe("readJson / writeJson", () => {
  it("round-trips arbitrary JSON-able values", () => {
    const storage = fakeStorage();
    writeJson("ng-scratch-rect", { x: 1, y: 2 }, storage);
    expect(readJson("ng-scratch-rect", null, storage)).toEqual({ x: 1, y: 2 });
  });

  it("falls back when absent or corrupt", () => {
    expect(readJson("missing", "fallback", fakeStorage())).toBe("fallback");
    expect(readJson("bad", "fallback", fakeStorage({ bad: "{not json" }))).toBe("fallback");
  });
});

describe("every reader/writer is safe when storage is absent or throws", () => {
  const throwing: PrefsStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };

  it("readers fall back to their default", () => {
    expect(readTheme(throwing)).toBe("light");
    expect(readNavCollapsed(throwing)).toBe(false);
    expect(readSlateCap(throwing)).toBe(5);
    expect(readJson("k", "fallback", throwing)).toBe("fallback");
    expect(readTheme(undefined)).toBe("light");
  });

  it("writers silently do nothing", () => {
    expect(() => writeTheme("dark", throwing)).not.toThrow();
    expect(() => writeNavCollapsed(true, throwing)).not.toThrow();
    expect(() => writeSlateCap(3, throwing)).not.toThrow();
    expect(() => writeJson("k", { a: 1 }, throwing)).not.toThrow();
    expect(() => writeTheme("dark", undefined)).not.toThrow();
  });
});
