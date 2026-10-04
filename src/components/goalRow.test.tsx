// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Goal } from "@/types";
import { GoalRow } from "./GoalRow";

const goal = {
  id: "g1", title: "Ship v1", description: "", context: "office", status: "active", target: null,
} as unknown as Goal;

describe("GoalRow", () => {
  it("shows title, next task and tabular count", () => {
    const html = renderToStaticMarkup(<GoalRow goal={goal} done={4} total={7} next="Write docs" onOpen={() => {}} />);
    expect(html).toContain("Ship v1");
    expect(html).toContain("Write docs");
    expect(html).toContain("4/7");
    expect(html).toContain("bg-surface");
  });
  it("on hold is transparent and hides Next when none", () => {
    const html = renderToStaticMarkup(
      <GoalRow goal={{ ...goal, status: "onhold" }} done={0} total={0} next={null} onOpen={() => {}} />,
    );
    expect(html).toContain("bg-transparent");
    expect(html).not.toContain("Next:");
  });
});
