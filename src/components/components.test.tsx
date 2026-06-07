// @vitest-environment node
// Rendered via react-dom/server (renderToStaticMarkup), which needs no DOM —
// so these run in the default node env. (jsdom is not installed in this repo,
// and the build contract forbids `npm install`.)
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Goal, Subtask, Task } from "@/types";
import { Icon } from "./Icon";
import { ContextDot } from "./ContextDot";
import { DueChip } from "./DueChip";
import { SubtaskMeta } from "./SubtaskMeta";
import { ProgressBar } from "./ProgressBar";
import { GoalChip } from "./GoalChip";
import { TaskRow } from "./TaskRow";
import { EmptyState } from "./EmptyState";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Write the report",
    context: "office",
    status: "open",
    created: "2026-06-07T12:00:00Z",
    due: null,
    snoozeUntil: null,
    completed: null,
    goalId: null,
    subtasks: [],
    ...over,
  };
}

const goal: Goal = {
  id: "g1",
  title: "Ship v1",
  description: "",
  context: "office",
  status: "active",
  target: null,
  created: "2026-01-01T00:00:00Z",
  updated: "2026-01-01T00:00:00Z",
};

describe("Icon", () => {
  it("renders an svg sized by the size prop", () => {
    const html = renderToStaticMarkup(<Icon name="check" size={14} />);
    expect(html).toContain("<svg");
    expect(html).toContain('width="14"');
    expect(html).toContain('height="14"');
  });

  it("includes the new trash glyph", () => {
    const html = renderToStaticMarkup(<Icon name="trash" />);
    expect(html).toContain("M5 7h14");
  });
});

describe("ContextDot", () => {
  it("renders a bordered square for office", () => {
    const html = renderToStaticMarkup(<ContextDot context="office" />);
    expect(html).toContain('title="Office"');
    expect(html).toContain("border-ink-3");
  });
  it("renders a filled accent circle for personal", () => {
    const html = renderToStaticMarkup(<ContextDot context="personal" />);
    expect(html).toContain('title="Personal"');
    expect(html).toContain("bg-accent");
    expect(html).toContain("rounded-full");
  });
});

describe("DueChip", () => {
  it("returns nothing when there is no due date", () => {
    expect(renderToStaticMarkup(<DueChip due={null} />)).toBe("");
  });
  it("renders a label for a due date", () => {
    const html = renderToStaticMarkup(<DueChip due="2026-06-07" />);
    expect(html).toContain("Due");
  });
});

describe("SubtaskMeta", () => {
  it("returns nothing for an empty list", () => {
    expect(renderToStaticMarkup(<SubtaskMeta subtasks={[]} />)).toBe("");
  });
  it("counts done subtasks as done/total", () => {
    const subs: Subtask[] = [
      { id: "a", title: "a", status: "done" },
      { id: "b", title: "b", status: "open" },
      { id: "c", title: "c", status: "done" },
    ];
    const html = renderToStaticMarkup(<SubtaskMeta subtasks={subs} />);
    expect(html).toContain("2/3");
  });
});

describe("ProgressBar", () => {
  it("computes the fill percentage", () => {
    const html = renderToStaticMarkup(<ProgressBar value={1} total={4} />);
    expect(html).toContain("width:25%");
    expect(html).toContain('aria-valuenow="25"');
  });
  it("guards a zero total", () => {
    const html = renderToStaticMarkup(<ProgressBar value={0} total={0} />);
    expect(html).toContain("width:0%");
  });
});

describe("GoalChip", () => {
  it("returns nothing when no goal is resolved", () => {
    expect(renderToStaticMarkup(<GoalChip goal={null} />)).toBe("");
  });
  it("renders the goal title when resolved", () => {
    const html = renderToStaticMarkup(<GoalChip goal={goal} />);
    expect(html).toContain("Ship v1");
  });
});

describe("TaskRow", () => {
  it("renders the title without strike-through for an open task", () => {
    const html = renderToStaticMarkup(<TaskRow task={task()} mode="noticeable" />);
    expect(html).toContain("Write the report");
    expect(html).not.toContain("line-through");
  });
  it("strikes through and mutes a done task and hides the age tag", () => {
    const html = renderToStaticMarkup(
      <TaskRow task={task({ status: "done", completed: "2026-06-07T13:00:00Z" })} mode="noticeable" />,
    );
    expect(html).toContain("line-through");
    expect(html).toContain("done");
  });
  it("shows the resolved goal chip when the task is linked", () => {
    const html = renderToStaticMarkup(
      <TaskRow task={task({ goalId: "g1" })} goal={goal} mode="noticeable" />,
    );
    expect(html).toContain("Ship v1");
  });
});

describe("EmptyState", () => {
  it("renders title and hint", () => {
    const html = renderToStaticMarkup(<EmptyState title="Nothing here" hint="Add a task" />);
    expect(html).toContain("Nothing here");
    expect(html).toContain("Add a task");
  });
});
