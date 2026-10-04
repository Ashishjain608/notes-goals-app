// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextAvatar } from "./ContextAvatar";

describe("ContextAvatar", () => {
  it.each([
    ["all", "All", "All"],
    ["office", "Off", "Office"],
    ["personal", "Per", "Personal"],
  ] as const)("%s", (filter, text, name) => {
    const html = renderToStaticMarkup(<ContextAvatar filter={filter} onClick={() => {}} />);
    expect(html).toContain(`>${text}</text>`);
    expect(html).toContain(`aria-label="Showing ${name}. Filter, Activity, Settings"`);
  });
});
