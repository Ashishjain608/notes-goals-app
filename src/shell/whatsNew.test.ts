import { describe, expect, it } from "vitest";
import { RELEASE_NOTES, shouldShowWhatsNew } from "./WhatsNew";

describe("What's new", () => {
  const current = Object.keys(RELEASE_NOTES)[0]!;
  it("shows once to someone updating into an existing data folder", () => {
    expect(shouldShowWhatsNew("0.3.1", current, true)).toBe(true);
    expect(shouldShowWhatsNew(null, current, true)).toBe(true); // updated from a build before this card existed
    expect(shouldShowWhatsNew(current, current, true)).toBe(false);
  });
  it("stays out of a fresh install's way, and of versions without notes", () => {
    expect(shouldShowWhatsNew(null, current, false)).toBe(false);
    expect(shouldShowWhatsNew("0.3.1", "9.9.9", true)).toBe(false);
  });
});
