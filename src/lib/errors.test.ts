import { describe, expect, it } from "vitest";
import { errorMessageOf } from "./errors";

describe("errorMessageOf", () => {
  it("uses an Error's message", () => {
    expect(errorMessageOf(new Error("disk full"))).toBe("disk full");
  });

  it("passes a string through", () => {
    expect(errorMessageOf("plain string")).toBe("plain string");
  });

  it("falls back for anything else", () => {
    expect(errorMessageOf({ weird: true })).toBe("Something went wrong.");
    expect(errorMessageOf(undefined)).toBe("Something went wrong.");
    expect(errorMessageOf(42)).toBe("Something went wrong.");
  });
});
