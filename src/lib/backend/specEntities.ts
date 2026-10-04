/** The six entities every side writes into fixtures/ (see fixtures/SPEC.md). Test support only. */

import type { Goal, Note, Notebook, Task } from "@/types";

const T0 = "2026-06-07T06:30:00Z";
const T1 = "2026-06-09T10:00:00Z";
const GOAL_ID = "33333333-3333-4333-8333-333333333333";
const NOTEBOOK_ID = "44444444-4444-4444-8444-444444444444";

export const taskFull: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  title: 'Call the bank: "yes" or no?',
  context: "office",
  status: "done",
  created: T0,
  due: "2026-06-10",
  snoozeUntil: null,
  completed: "2026-06-08T09:15:00Z",
  goalId: GOAL_ID,
  subtasks: [
    { id: "s1", title: "Find the account number", status: "done" },
    { id: "s2", title: "Ask about fees", status: "open" },
  ],
  details: "Line one\nLine two — ünïcödé ✓",
  priority: true,
  attachments: [
    {
      path: "attachments/11111111-1111-4111-8111-111111111111/statement.pdf",
      name: "statement.pdf",
      size: 2048,
      added: "2026-06-07T06:31:00Z",
    },
  ],
  committedOn: "2026-06-08",
  carried: 2,
};

export const taskMinimal: Task = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "yes",
  context: "personal",
  status: "open",
  created: T0,
  due: null,
  snoozeUntil: null,
  completed: null,
  goalId: null,
  subtasks: [],
  details: "",
  priority: false,
  attachments: [],
  committedOn: null,
  carried: 0,
};

export const goal: Goal = {
  id: GOAL_ID,
  title: "123",
  description: "# Plan\n\n- step: one",
  context: "personal",
  status: "onhold",
  target: "2026-12-31",
  created: T0,
  updated: T1,
};

export const notebook: Notebook = {
  id: NOTEBOOK_ID,
  name: "Reading: 2026",
  context: "office",
  created: T0,
  updated: T1,
};

export const noteFull: Note = {
  id: "55555555-5555-4555-8555-555555555555",
  title: "null",
  context: "office",
  goalId: GOAL_ID,
  notebookId: NOTEBOOK_ID,
  created: T0,
  updated: T1,
  attachments: [
    {
      path: "attachments/55555555-5555-4555-8555-555555555555/sketch.png",
      name: "sketch.png",
      size: 512,
      added: "2026-06-07T06:31:00Z",
    },
  ],
  pinned: true,
};
export const noteFullBody = "# Heading\n\nSome *markdown* with --- inside\n\n---\n\nAfter a rule.\n";

export const noteMinimal: Note = {
  id: "66666666-6666-4666-8666-666666666666",
  title: "Plain title",
  context: "personal",
  goalId: null,
  notebookId: null,
  created: T0,
  updated: T0,
  attachments: [],
  pinned: false,
};
export const noteMinimalBody = "";
