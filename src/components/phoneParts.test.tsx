// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SlotMeter } from "./SlotMeter";
import { ChipStrip } from "./ChipStrip";
import { ActionTile } from "./ActionTile";

describe("phone parts", () => {
  it("SlotMeter fills one pill per committed task", () => {
    const html = renderToStaticMarkup(<SlotMeter cap={5} filled={3} trailing="2 open" />);
    expect(html.match(/bg-accent"/g)).toHaveLength(3);
    expect(html.match(/bg-ink-6/g)).toHaveLength(2);
    expect(html).toContain('aria-label="3 of 5 slots committed"');
  });
  it("ChipStrip marks pressed chips", () => {
    const html = renderToStaticMarkup(
      <ChipStrip label="Filters" chips={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} pressed={["b"]} onToggle={() => {}} />,
    );
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
  });
  it("ActionTile shows the badge instead of the icon", () => {
    expect(renderToStaticMarkup(<ActionTile icon="today" label="Committed" pressed badge={2} onClick={() => {}} />)).toContain(">2</span>");
  });
});
