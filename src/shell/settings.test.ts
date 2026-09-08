import { describe, expect, it } from "vitest";
import { shortenHome } from "./Settings";

describe("shortenHome", () => {
  it("shortens a path under home to a ~-prefixed form", () => {
    expect(shortenHome("/Users/ash/Documents/Notes", "/Users/ash")).toBe("~/Documents/Notes");
  });

  it("shortens the home directory itself to bare ~", () => {
    expect(shortenHome("/Users/ash", "/Users/ash")).toBe("~");
  });

  it("leaves a path outside home untouched", () => {
    expect(shortenHome("/Volumes/External/Notes", "/Users/ash")).toBe("/Volumes/External/Notes");
  });

  it("does not shorten a sibling path that merely shares the home prefix", () => {
    expect(shortenHome("/Users/ashley/Notes", "/Users/ash")).toBe("/Users/ashley/Notes");
  });

  it("falls back to the full path when home is unknown", () => {
    expect(shortenHome("/Users/ash/Documents/Notes", null)).toBe("/Users/ash/Documents/Notes");
  });
});
