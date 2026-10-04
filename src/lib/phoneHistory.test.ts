import { describe, expect, it, vi } from "vitest";
import { createLayerHistory, type HistoryLike } from "./phoneHistory";

/** A fake session history: entries + index; `go` is async (like browsers) until `settle()`. */
function fakeHistory() {
  const entries: unknown[] = [null];
  let index = 0;
  let pendingGo: number | null = null;
  const h: HistoryLike & { pushes: number; gos: number[] } = {
    get state() {
      return entries[index];
    },
    pushState(data) {
      entries.splice(index + 1);
      entries.push(data);
      index += 1;
      h.pushes += 1;
    },
    go(delta) {
      if (delta === 0) throw new Error("go(0) reloads");
      h.gos.push(delta);
      pendingGo = delta;
    },
    pushes: 0,
    gos: [],
  };
  return {
    h,
    /** Deliver the pending go() as a popstate. */
    settle(onPop: (s: unknown) => void) {
      if (pendingGo === null) return;
      index += pendingGo;
      pendingGo = null;
      onPop(entries[index]);
    },
    /** The user swipes back (or forward with +1). */
    swipe(delta: number, onPop: (s: unknown) => void) {
      index += delta;
      onPop(entries[index]);
    },
    get index() {
      return index;
    },
  };
}

function setup() {
  const queue: (() => void)[] = [];
  const fake = fakeHistory();
  const lh = createLayerHistory(fake.h, (fn) => queue.push(fn));
  const flush = (): void => {
    while (queue.length) queue.shift()?.();
  };
  const pop = (s: unknown): void => lh.onPopState(s);
  return { fake, lh, flush, pop };
}

describe("phone layer history", () => {
  it("opening a layer pushes one entry; swipe-back closes it without further traffic", () => {
    const { fake, lh, flush, pop } = setup();
    const close = vi.fn(() => lh.remove("sheet")); // the UI's close path calls remove
    lh.push("sheet", close);
    flush();
    expect(fake.h.pushes).toBe(1);

    fake.swipe(-1, pop);
    flush();
    expect(close).toHaveBeenCalledTimes(1);
    expect(lh.size()).toBe(0);
    expect(fake.h.gos).toEqual([]);
    expect(fake.index).toBe(0);
  });

  it("closing from the UI walks history back once and closes nothing else", () => {
    const { fake, lh, flush, pop } = setup();
    const close = vi.fn();
    lh.push("sheet", close);
    flush();
    lh.remove("sheet");
    flush();
    expect(fake.h.gos).toEqual([-1]);
    fake.settle(pop);
    flush();
    expect(close).not.toHaveBeenCalled();
    expect(fake.index).toBe(0);
  });

  it("close-then-open in one tick (FAB menu → composer) reuses the entry", () => {
    const { fake, lh, flush, pop } = setup();
    const closeMenu = vi.fn();
    const closeComposer = vi.fn();
    lh.push("menu", closeMenu);
    flush();
    lh.remove("menu");
    lh.push("composer", closeComposer);
    flush();
    expect(fake.h.pushes).toBe(1);
    expect(fake.h.gos).toEqual([]);

    fake.swipe(-1, pop);
    expect(closeComposer).toHaveBeenCalledTimes(1);
    expect(closeMenu).not.toHaveBeenCalled();
  });

  it("stacked layers close one per swipe, top first", () => {
    const { fake, lh, flush, pop } = setup();
    const order: string[] = [];
    lh.push("a", () => order.push("a"));
    lh.push("b", () => order.push("b"));
    flush();
    expect(fake.h.pushes).toBe(2);
    fake.swipe(-1, pop);
    expect(order).toEqual(["b"]);
    fake.swipe(-1, pop);
    expect(order).toEqual(["b", "a"]);
  });

  it("re-pushing an open id keeps one entry and uses the latest close", () => {
    const { fake, lh, flush, pop } = setup();
    const first = vi.fn();
    const second = vi.fn();
    lh.push("x", first);
    lh.push("x", second);
    flush();
    expect(fake.h.pushes).toBe(1);
    fake.swipe(-1, pop);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("swipe-forward onto a stale layer entry is walked back", () => {
    const { fake, lh, flush, pop } = setup();
    lh.push("x", vi.fn());
    flush();
    lh.remove("x");
    flush();
    fake.settle(pop);
    flush();
    fake.swipe(+1, pop); // forward onto the old depth-1 entry
    flush();
    expect(fake.h.gos).toEqual([-1, -1]);
  });

  it("a layer opened while a walk-back is in flight gets its entry after the popstate", () => {
    const { fake, lh, flush, pop } = setup();
    lh.push("a", vi.fn());
    flush();
    lh.remove("a");
    flush(); // go(-1) pending
    const closeB = vi.fn();
    lh.push("b", closeB);
    flush(); // waits for the traversal
    expect(fake.h.pushes).toBe(1);
    fake.settle(pop);
    flush();
    expect(closeB).not.toHaveBeenCalled();
    expect(fake.h.pushes).toBe(2);
    fake.swipe(-1, pop);
    expect(closeB).toHaveBeenCalledTimes(1);
  });

  it("removing an unknown id is a no-op", () => {
    const { fake, lh, flush } = setup();
    lh.remove("nope");
    flush();
    expect(fake.h.pushes + fake.h.gos.length).toBe(0);
  });
});
