// ui.jsx — shared primitives. Depends on window.Icon + data helpers.
const { Icon, ageInDays, dueLabel, GOALS } = window;

function goalById(id) { return (window.GOALS || []).find(g => g.id === id); }

// --- Aging model: the heart of the "task is the source of truth" idea ---
// mode: 'subtle' | 'noticeable' | 'escalating'
function computeAging(task, mode) {
  const n = ageInDays(task.created);
  const label = n <= 0 ? 'today' : `${n}d`;
  let tone = 'fresh';
  if (n >= 7) tone = 'stale';
  else if (n >= 3) tone = 'aging';

  if (mode === 'subtle') {
    return { n, label, color: 'var(--ink-3)', tintBg: null, barColor: null, barW: 0 };
  }
  const color = tone === 'stale' ? 'var(--accent-ink)' : tone === 'aging' ? 'var(--warn-ink)' : 'var(--ink-3)';
  if (mode === 'escalating') {
    // a left bar that grows + deepens with age
    const barW = Math.min(3, Math.round((n / 4))); // 0..3px
    const barColor = tone === 'stale' ? 'var(--accent)' : tone === 'aging' ? 'var(--warn-ink)' : 'var(--line-2)';
    const tintBg = tone === 'stale' ? 'var(--accent-soft)' : tone === 'aging' ? 'var(--warn-soft)' : null;
    return { n, label, color, tintBg, barColor, barW };
  }
  // noticeable (default): warm label; faint tint only when stale
  return { n, label, color, tintBg: tone === 'stale' ? 'var(--accent-soft)' : null, barColor: null, barW: 0 };
}

function ContextDot({ context, size = 7 }) {
  const c = context === 'Office' ? 'var(--ink-2)' : 'var(--accent)';
  if (context === 'Office')
    return <span title="Office" style={{ width: size, height: size, borderRadius: 2, border: '1.5px solid var(--ink-3)', display: 'inline-block', flexShrink: 0 }} />;
  return <span title="Personal" style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />;
}

function AgeTag({ task, mode }) {
  const a = computeAging(task, mode);
  return (
    <span title={`Open ${a.n} day${a.n === 1 ? '' : 's'}`} style={{
      fontSize: 12, fontVariantNumeric: 'tabular-nums', color: a.color,
      fontWeight: a.n >= 7 ? 600 : 500, letterSpacing: '.01em', whiteSpace: 'nowrap',
    }}>{a.label}</span>
  );
}

function Checkbox({ checked, dropped, onClick, size = 18 }) {
  const [hov, setHov] = React.useState(false);
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: size, height: size, borderRadius: dropped ? 4 : '50%', flexShrink: 0,
        border: `1.6px solid ${checked ? 'var(--accent)' : hov ? 'var(--accent)' : 'var(--line-2)'}`,
        background: checked ? 'var(--accent)' : 'transparent',
        display: 'grid', placeItems: 'center', transition: 'all .15s ease', marginTop: 1,
        color: '#fff',
      }} aria-label={checked ? 'Mark open' : 'Mark done'}>
      {checked && <Icon name="check" size={size - 6} />}
      {!checked && dropped && <span style={{ width: 7, height: 1.6, background: 'var(--ink-3)' }} />}
      {!checked && hov && !dropped && <Icon name="check" size={size - 6} style={{ color: 'var(--accent)', opacity: .5 }} />}
    </button>
  );
}

function GoalChip({ goalId, onOpen }) {
  const g = goalById(goalId);
  if (!g) return null;
  return (
    <button onClick={(e) => { e.stopPropagation(); onOpen && onOpen(g.id); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-2)',
        padding: '1px 4px', borderRadius: 5, maxWidth: 180, transition: 'color .15s, background .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-ink)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-2)'; e.currentTarget.style.background = 'transparent'; }}>
      <Icon name="goals" size={12} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
    </button>
  );
}

function DueChip({ due }) {
  const d = dueLabel(due);
  if (!d) return null;
  const color = d.tone === 'overdue' ? 'var(--accent-ink)' : d.tone === 'soon' ? 'var(--warn-ink)' : 'var(--ink-2)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color, fontWeight: d.tone === 'overdue' ? 600 : 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
      <Icon name="calendar" size={12} /> {d.text}
    </span>
  );
}

function SubtaskMeta({ subtasks }) {
  if (!subtasks || !subtasks.length) return null;
  const done = subtasks.filter(s => s.done).length;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
      <Icon name="tasks" size={12} /> {done}/{subtasks.length}
    </span>
  );
}

function ProgressBar({ value, total, width = 'auto', height = 5 }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ width, height, background: 'var(--line)', borderRadius: 999, overflow: 'hidden', flex: width === 'auto' ? 1 : 'none' }}>
      <div style={{ width: pct + '%', height: '100%', background: 'var(--accent)', borderRadius: 999, transition: 'width .5s cubic-bezier(.2,.7,.2,1)' }} />
    </div>
  );
}

// The canonical task row used across Today, Backlog, and Goal pages.
function TaskRow({ task, mode, showContext, onToggle, onOpen, onOpenGoal, dense }) {
  const [hov, setHov] = React.useState(false);
  const done = task.status === 'Done';
  const dropped = task.status === 'Dropped';
  const a = computeAging(task, mode || 'noticeable');
  const muted = done || dropped;
  return (
    <div onClick={() => onOpen && onOpen(task.id)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: dense ? '8px 14px 8px 16px' : '11px 14px 11px 16px',
        borderRadius: 9, cursor: 'pointer',
        background: hov ? 'var(--raise)' : (a.tintBg && !muted ? a.tintBg : 'transparent'),
        transition: 'background .15s ease',
      }}>
      {a.barW > 0 && !muted && (
        <span style={{ position: 'absolute', left: 4, top: 8, bottom: 8, width: a.barW, borderRadius: 2, background: a.barColor }} />
      )}
      <Checkbox checked={done} dropped={dropped} onClick={() => onToggle && onToggle(task.id)} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5, lineHeight: 1.35, color: muted ? 'var(--ink-3)' : 'var(--ink)',
          fontWeight: 450, textDecoration: muted ? 'line-through' : 'none',
          textDecorationColor: 'var(--ink-3)', letterSpacing: '-.005em',
        }}>{task.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: muted ? 0 : 5, flexWrap: 'wrap', opacity: muted ? .7 : 1 }}>
          {showContext && <ContextDot context={task.context} />}
          {!muted && <DueChip due={task.due} />}
          {!muted && <SubtaskMeta subtasks={task.subtasks} />}
          {task.goalId && <GoalChip goalId={task.goalId} onOpen={onOpenGoal} />}
          {done && task.completedAt && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>done today</span>}
          {dropped && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>dropped</span>}
        </div>
      </div>
      {!muted && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 1 }}>
          <AgeTag task={task} mode={mode || 'noticeable'} />
        </div>
      )}
    </div>
  );
}

function Pill({ active, onClick, children, count }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999,
      fontSize: 13, fontWeight: 500, letterSpacing: '-.005em',
      color: active ? 'var(--ink)' : 'var(--ink-2)',
      background: active ? 'var(--surface)' : 'transparent',
      boxShadow: active ? 'var(--shadow-sm)' : 'none',
      border: active ? '1px solid var(--line)' : '1px solid transparent',
      transition: 'all .15s ease',
    }}>
      {children}
      {count != null && <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
    </button>
  );
}

Object.assign(window, { computeAging, ContextDot, AgeTag, Checkbox, GoalChip, DueChip, SubtaskMeta, ProgressBar, TaskRow, Pill, goalById });
