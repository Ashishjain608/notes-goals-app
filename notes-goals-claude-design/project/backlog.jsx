// backlog.jsx — All Tasks / backlog with filters.
const { TaskRow, Pill, Icon } = window;

function Backlog({ tasks, context, mode, handlers }) {
  const [status, setStatus] = React.useState('Open');
  const [chip, setChip] = React.useState(null); // 'due' | 'snoozed' | 'goal'
  const inCtx = (t) => context === 'All' || t.context === context;

  let list = tasks.filter(inCtx);
  if (status !== 'All') list = list.filter(t => t.status === status);
  if (chip === 'due') list = list.filter(t => t.due);
  if (chip === 'snoozed') list = list.filter(t => window.isSnoozed(t));
  if (chip === 'goal') list = list.filter(t => t.goalId);
  list = list.slice().sort((a, b) => new Date(a.created) - new Date(b.created));

  const counts = {
    Open: tasks.filter(t => inCtx(t) && t.status === 'Open').length,
    Done: tasks.filter(t => inCtx(t) && t.status === 'Done').length,
    Dropped: tasks.filter(t => inCtx(t) && t.status === 'Dropped').length,
  };

  return (
    <div className="scroll" style={{ height: '100%', padding: '40px 0 120px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 40px' }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent-ink)', marginBottom: 8 }}>Backlog</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 32, margin: 0, letterSpacing: '-.01em' }}>All Tasks</h1>
        </header>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6, position: 'sticky', top: -40, background: 'var(--bg)', paddingBottom: 10, zIndex: 2 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', padding: 3, borderRadius: 10 }}>
            {['Open', 'Done', 'Dropped', 'All'].map(s => (
              <button key={s} onClick={() => setStatus(s)} style={{ padding: '5px 13px', borderRadius: 7, fontSize: 13, fontWeight: 500,
                background: status === s ? 'var(--surface)' : 'transparent', color: status === s ? 'var(--ink)' : 'var(--ink-3)',
                boxShadow: status === s ? 'var(--shadow-sm)' : 'none', display: 'flex', gap: 6, alignItems: 'center' }}>
                {s}{counts[s] != null && <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{counts[s]}</span>}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--line-2)', margin: '0 2px' }} />
          {[['due', 'calendar', 'Has due date'], ['snoozed', 'snooze', 'Snoozed'], ['goal', 'goals', 'Linked to goal']].map(([k, i, l]) => (
            <button key={k} onClick={() => setChip(chip === k ? null : k)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
              border: '1px solid', borderColor: chip === k ? 'var(--accent-line)' : 'var(--line)', background: chip === k ? 'var(--accent-soft)' : 'transparent', color: chip === k ? 'var(--accent-ink)' : 'var(--ink-2)' }}>
              <Icon name={i} size={13} /> {l}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 6 }}>
          {list.length === 0 && <div style={{ padding: '50px 16px', textAlign: 'center', color: 'var(--ink-3)', fontStyle: 'italic' }}>Nothing here.</div>}
          {list.map(t => <TaskRow key={t.id} task={t} mode={mode} showContext={context === 'All'} {...handlers} />)}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Backlog });
