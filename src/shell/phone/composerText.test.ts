import { describe, expect, it } from "vitest";
import { continueChecklist, cutRange, isBlankBody } from "./composerText";

describe("cutRange", () => {
  it("removes a token and collapses the seam", () => {
    const t = "Renew passport tomorrow #personal";
    expect(cutRange(t, 15, 23)).toBe("Renew passport #personal");
    expect(cutRange(t, 24, 33)).toBe("Renew passport tomorrow");
    expect(cutRange("tomorrow call mum", 0, 8)).toBe("call mum");
  });
});

describe("continueChecklist", () => {
  it("continues a checklist item", () => {
    expect(continueChecklist("- [ ] milk", 10)).toEqual({ value: "- [ ] milk\n- [ ] ", caret: 17 });
  });
  it("ends the list on an empty item", () => {
    expect(continueChecklist("- [ ] milk\n- [ ] ", 17)).toEqual({ value: "- [ ] milk\n", caret: 11 });
  });
  it("leaves plain lines alone", () => {
    expect(continueChecklist("hello", 5)).toBeNull();
    expect(continueChecklist("- [ ] a\nplain", 13)).toBeNull();
  });
  it("splits an item when the caret is mid-line", () => {
    expect(continueChecklist("- [ ] milkeggs", 10)).toEqual({ value: "- [ ] milk\n- [ ] eggs", caret: 17 });
  });
});

describe("isBlankBody", () => {
  it("treats empty checklist scaffolding as blank", () => {
    expect(isBlankBody("")).toBe(true);
    expect(isBlankBody("- [ ] \n- [ ] ")).toBe(true);
    expect(isBlankBody("- [ ] milk")).toBe(false);
  });
});
