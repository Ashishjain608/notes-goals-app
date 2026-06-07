// data.jsx — mock entities for Notes & Goals. Deterministic relative to TODAY.
const TODAY = new Date('2026-06-06T09:00:00');

function daysAgo(n) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function daysAhead(n) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
function ageInDays(iso) {
  const d = new Date(iso);
  return Math.max(0, Math.round((TODAY - d) / 86400000));
}
function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
// relative due label: "Overdue 2d", "Today", "Tomorrow", "in 3d"
function dueLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = Math.round((d - TODAY) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, tone: 'overdue' };
  if (diff === 0) return { text: 'Due today', tone: 'soon' };
  if (diff === 1) return { text: 'Due tomorrow', tone: 'soon' };
  if (diff <= 6) return { text: `Due in ${diff}d`, tone: 'normal' };
  return { text: `Due ${fmtDate(iso)}`, tone: 'normal' };
}

const GOALS = [
  {
    id: 'g-deck', title: 'Q3 board deck', context: 'Office', status: 'Active',
    target: daysAhead(9),
    desc: 'Tell a clean story on retention and the path to break-even. Three acts: where we are, what we learned, the plan. Keep it to twelve slides — the appendix carries the rest.',
  },
  {
    id: 'g-marathon', title: 'Run a half marathon', context: 'Personal', status: 'Active',
    target: daysAhead(74),
    desc: 'Brighton, mid-August. Goal is to finish strong under 2:00, not to race it. Build base now, layer in tempo work in July, taper the final ten days.',
  },
  {
    id: 'g-site', title: 'Rebuild personal site', context: 'Personal', status: 'Active',
    target: null,
    desc: 'A quiet home for writing and a few projects. Static, fast, mine. No analytics theatre.',
  },
  {
    id: 'g-hire', title: 'Hire a product designer', context: 'Office', status: 'Active',
    target: daysAhead(30),
    desc: 'One senior generalist who can own end-to-end flows. Close by end of quarter.',
  },
];

let TASKS = [
  // ---- Office ----
  { id: 't1', title: 'Reply to legal on the vendor MSA', context: 'Office', status: 'Open',
    created: daysAgo(6), due: daysAhead(1), goalId: null, snoozeUntil: null, subtasks: [] },
  { id: 't2', title: 'Draft the board deck narrative outline', context: 'Office', status: 'Open',
    created: daysAgo(2), due: daysAhead(3), goalId: 'g-deck', snoozeUntil: null,
    subtasks: [
      { id: 't2a', title: 'Pull retention cohort chart', done: true },
      { id: 't2b', title: 'Write the “what we learned” slide', done: false },
      { id: 't2c', title: 'Get revenue numbers from Priya', done: false },
    ] },
  { id: 't3', title: 'Review the analytics dashboard PR', context: 'Office', status: 'Open',
    created: daysAgo(1), due: null, goalId: null, snoozeUntil: null, subtasks: [] },
  { id: 't4', title: 'Prep 1:1 notes for Sana', context: 'Office', status: 'Open',
    created: daysAgo(4), due: daysAhead(0), goalId: null, snoozeUntil: null, subtasks: [] },
  { id: 't5', title: 'Shortlist three designer candidates', context: 'Office', status: 'Open',
    created: daysAgo(3), due: null, goalId: 'g-hire', snoozeUntil: null, subtasks: [] },
  // ---- Personal ----
  { id: 't6', title: 'Book a dentist appointment', context: 'Personal', status: 'Open',
    created: daysAgo(11), due: null, goalId: null, snoozeUntil: null, subtasks: [] },
  { id: 't7', title: 'Order new running shoes', context: 'Personal', status: 'Open',
    created: daysAgo(1), due: null, goalId: 'g-marathon', snoozeUntil: null, subtasks: [] },
  { id: 't8', title: 'Plan the weekend trip to the coast', context: 'Personal', status: 'Open',
    created: daysAgo(3), due: daysAhead(1), goalId: null, snoozeUntil: null, subtasks: [] },
  { id: 't9', title: 'Pick a static site framework', context: 'Personal', status: 'Open',
    created: daysAgo(5), due: null, goalId: 'g-site', snoozeUntil: null, subtasks: [] },
  // ---- Completed today ----
  { id: 't10', title: 'Send the March invoice to Acme', context: 'Office', status: 'Done',
    created: daysAgo(2), completedAt: daysAgo(0), due: null, goalId: null, snoozeUntil: null, subtasks: [] },
  { id: 't11', title: 'Easy 5k along the river', context: 'Personal', status: 'Done',
    created: daysAgo(1), completedAt: daysAgo(0), due: null, goalId: 'g-marathon', snoozeUntil: null, subtasks: [] },
  // ---- Snoozed (hidden from Today) ----
  { id: 't12', title: 'Renew passport', context: 'Personal', status: 'Open',
    created: daysAgo(8), due: null, goalId: null, snoozeUntil: daysAhead(12), subtasks: [] },
  { id: 't13', title: 'File Q2 expenses', context: 'Office', status: 'Open',
    created: daysAgo(4), due: null, goalId: null, snoozeUntil: daysAhead(2), subtasks: [] },
  // ---- Dropped (lives only in backlog) ----
  { id: 't14', title: 'Evaluate the new CRM', context: 'Office', status: 'Dropped',
    created: daysAgo(20), due: null, goalId: null, snoozeUntil: null, subtasks: [] },
  // ---- A few older completed (for backlog realism) ----
  { id: 't15', title: 'Confirm venue for the offsite', context: 'Office', status: 'Done',
    created: daysAgo(9), completedAt: daysAgo(3), due: null, goalId: null, snoozeUntil: null, subtasks: [] },
];

const NOTES = [
  { id: 'n1', title: 'Board deck — narrative', context: 'Office', goalId: 'g-deck',
    updated: daysAgo(1),
    excerpt: 'The story isn’t the numbers, it’s what the numbers let us do next.',
    body: [
      { t: 'h', x: 'The shape of the story' },
      { t: 'p', x: 'Three acts. Where we are — honest, no spin. What we learned — the two bets that paid off and the one that didn’t. The plan — a credible path to break-even by Q1.' },
      { t: 'p', x: 'Resist the urge to bury the lede in an appendix. The retention curve is the whole argument; it should be the second slide, not the twelfth.' },
      { t: 'h', x: 'Open questions' },
      { t: 'li', x: 'Do we show gross or net retention up front?' },
      { t: 'li', x: 'How much of the pricing change do we pre-commit to?' },
    ] },
  { id: 'n2', title: 'Half marathon — training plan', context: 'Personal', goalId: 'g-marathon',
    updated: daysAgo(2),
    excerpt: 'Build base through June. Don’t race the long runs.',
    body: [
      { t: 'h', x: 'June — base' },
      { t: 'p', x: 'Four runs a week, all easy. One long run on Sunday, adding a kilometre each week until it reaches sixteen. Heart rate stays conversational the entire time.' },
      { t: 'h', x: 'July — sharpen' },
      { t: 'p', x: 'Introduce one tempo run midweek. Keep the long run, hold it at sixteen. This is where it starts to feel real.' },
    ] },
  { id: 'n3', title: 'Someday / maybe', context: 'Personal', goalId: null,
    updated: daysAgo(5),
    excerpt: 'A holding pen for ideas that aren’t ready to be tasks.',
    body: [
      { t: 'p', x: 'Learn to develop film at home. Reread the Earthsea books. Build a little weather display for the kitchen. None of these are urgent — that’s the point of this page.' },
    ] },
  { id: 'n4', title: '1:1 with Sana — rolling', context: 'Office', goalId: null,
    updated: daysAgo(4),
    excerpt: 'Running agenda so neither of us walks in cold.',
    body: [
      { t: 'h', x: 'For this week' },
      { t: 'li', x: 'Dashboard PR — is the scope creeping?' },
      { t: 'li', x: 'How is she feeling about the hiring loop?' },
      { t: 'p', x: 'She mentioned wanting more design review time. Worth protecting an hour on Thursdays.' },
    ] },
];

// expose
Object.assign(window, { TODAY, GOALS, TASKS, NOTES, ageInDays, fmtDate, dueLabel, daysAgo, daysAhead });
