// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomSheet } from "./BottomSheet";

const sheet = (props: Partial<Parameters<typeof BottomSheet>[0]> = {}): string =>
  renderToStaticMarkup(
    <BottomSheet open onClose={() => {}} title="Filters" {...props}>
      <p>body</p>
    </BottomSheet>,
  );

describe("BottomSheet", () => {
  it("renders nothing when closed", () => {
    expect(sheet({ open: false })).toBe("");
  });

  it("renders an accessible dialog with title, Done and children", () => {
    const html = sheet();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Filters"');
    expect(html).toContain(">Filters</span>");
    expect(html).toContain(">Done</button>");
    expect(html).toContain("<p>body</p>");
  });

  it("supports a custom done label", () => {
    expect(sheet({ doneLabel: "Save" })).toContain(">Save</button>");
  });

  it("hides the visible title but keeps the accessible name", () => {
    const html = sheet({ showTitle: false });
    expect(html).not.toContain(">Filters</span>");
    expect(html).toContain('aria-label="Filters"');
  });

  it("lifts above the keyboard via bottomInset", () => {
    const html = sheet({ bottomInset: 300 });
    expect(html).toContain("bottom:300px");
    expect(html).not.toContain("safe-area-inset-bottom");
  });
});
