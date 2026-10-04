import { describe, expect, it } from "vitest";
import { keyboardInset } from "./keyboard";

describe("keyboardInset", () => {
  it.each([
    // [label, innerHeight, vvHeight, vvOffsetTop, editing, expected]
    ["keyboard down", 844, 844, 0, true, 0],
    ["keyboard up, page not scrolled", 844, 508, 0, true, 336],
    ["keyboard up, iOS scrolled the page to the field", 844, 508, 120, true, 216],
    ["fractional viewport heights round", 844, 507.6, 0, true, 336],
    ["small gap is chrome, not a keyboard", 844, 800, 0, true, 0],
    ["viewport stuck shrunk after blur (standalone bug)", 844, 508, 0, false, 0],
    ["visual viewport taller than layout (pinch) never goes negative", 844, 900, 0, true, 0],
  ])("%s", (_label, innerHeight, vvHeight, vvOffsetTop, editing, expected) => {
    expect(keyboardInset({ innerHeight, vvHeight, vvOffsetTop, editing })).toBe(expected);
  });
});
