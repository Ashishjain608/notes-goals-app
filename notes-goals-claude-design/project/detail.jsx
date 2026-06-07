// detail.jsx — quick-add variants + task detail panel.
const { Icon, ContextDot, GoalChip, computeAging, GOALS, dueLabel, fmtDate } = window;

// ---------- shared inline option menu ----------
function OptionRow({ icon, label, sub, onClick, danger, active }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '8px 10px', borderRadius: 7, background: h ? 'var(--raise)' : 'transparent',
        color: danger ? 'var(--accent-ink)' : 'var(--ink)', fontSize: 13.5 }}>
      {icon && <Icon name={icon} size={15} style={{ color: 'var(--ink-3)' }} />}
      <span style={{ flex: 1 }}>{label}</span>
      {sub && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</span>}
      {active && <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />}
    </button>
  );
}

// ============ QUICK ADD: inline bar ============
function QuickAddInline({ context, onAdd }) {
  const [val, setVal] = React.useState('');
  const [ctx, setCtx] = React.useState(context === 'All' ? 'Office' : context);
  const ref = React.useRef(null);
  React.useEffect(() => { if (context !== 'All') setCtx(context); }, [context]);
  const submit = () => { if (val.trim()) { onAdd(val.trim(), ctx); setVal(''); } };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', margin: '0 16px',
      background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 11, boxShadow: 'var(--shadow-sm)' }}>
      <Icon name="plus" size={18} style={{ color: 'var(--ink-3)' }} />
      <input ref={ref} value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="Add a task — it stays here until you finish it"
        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14.5, letterSpacing: '-.005em' }} />
      <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', borderRadius: 8, padding: 2 }}>
        {['Office', 'Personal'].map(c => (
          <button key={c} onClick={() => setCtx(c)} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            background: ctx === c ? 'var(--surface)' : 'transparent', color: ctx === c ? 'var(--ink)' : 'var(--ink-3)',
            boxShadow: ctx === c ? 'var(--shadow-sm)' : 'none' }}>
            <ContextDot context={c} size={6} /> {c}
          </button>
        ))}
      </div>
      <kbd style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>↵</kbd>
    </div>
  );
}

// ============ QUICK ADD: command palette ============
function CommandPalette({ open, context, onAdd, onClose, onNavigate }) {
  const [val, setVal] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => { if (open && ref.current) { ref.current.focus(); setVal(''); } }, [open]);
  if (!open) return null;
  const submit = () => { if (val.trim()) { onAdd(val.trim(), context === 'All' ? 'Office' : context); onClose(); } };
  const jumps = [{ k: 'today', l: 'Today', i: 'today' }, { k: 'tasks', l: 'All Tasks', i: 'tasks' }, { k: 'notes', l: 'Notes', i: 'notes' }, { k: 'goals', l: 'Goals', i: 'goals' }];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,18,15,.28)',
      backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '16vh', animation: 'overlayIn .15s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '90vw', background: 'var(--surface)',
        borderRadius: 14, boxShadow: 'var(--shadow)', border: '1px solid var(--line)', overflow: 'hidden', animation: 'riseIn .2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="plus" size={20} style={{ color: 'var(--accent)' }} />
          <input ref={ref} value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
            placeholder="Add a task, or type to jump…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16.5, letterSpacing: '-.01em' }} />
          <kbd style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', border: '1px solid var(--line-2)', borderRadius: 5, padding: '2px 6px' }}>esc</kbd>
        </div>
        <div style={{ padding: 8 }}>
          {val.trim() ? (
            <OptionRow icon="plus" label={<span>Add task <strong>“{val.trim()}”</strong></span>} sub={(context === 'All' ? 'Office' : context)} onClick={submit} />
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', padding: '4px 10px', letterSpacing: '.06em', textTransform: 'uppercase' }}>Jump to</div>
              {jumps.map(j => <OptionRow key={j.k} icon={j.i} label={j.l} onClick={() => { onNavigate(j.k); onClose(); }} />)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ QUICK ADD: floating composer ============
function FloatingComposer({ context, onAdd }) {
  const [open, setOpen] = React.useState(false);
  const [val, setVal] = React.useState('');
  const [ctx, setCtx] = React.useState(context === 'All' ? 'Office' : context);
  const ref = React.useRef(null);
  React.useEffect(() => { if (open && ref.current) ref.current.focus(); }, [open]);
  const submit = () => { if (val.trim()) { onAdd(val.trim(), ctx); setVal(''); setOpen(false); } };
  return (
    <div style={{ position: 'fixed', right: 28, bottom: 28, zIndex: 55, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
      {open && (
        <div style={{ width: 340, background: 'var(--surface)', borderRadius: 14, boxShadow: 'var(--shadow)', border: '1px solid var(--line)', padding: 14, animation: 'riseIn .18s ease' }}>
          <textarea ref={ref} value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === 'Escape') setOpen(false); }}
            placeholder="What needs doing?" rows={2}
            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 15, resize: 'none', lineHeight: 1.4 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', borderRadius: 8, padding: 2 }}>
              {['Office', 'Personal'].map(c => (
                <button key={c} onClick={() => setCtx(c)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  background: ctx === c ? 'var(--surface)' : 'transparent', color: ctx === c ? 'var(--ink)' : 'var(--ink-3)', boxShadow: ctx === c ? 'var(--shadow-sm)' : 'none' }}>
                  <ContextDot context={c} size={6} /> {c}
                </button>
              ))}
            </div>
            <button onClick={submit} style={{ background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8 }}>Add</button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent)', color: '#fff',
        boxShadow: '0 8px 24px -6px rgba(194,96,63,.5)', display: 'grid', placeItems: 'center', transition: 'transform .2s ease', transform: open ? 'rotate(45deg)' : 'none' }}>
        <Icon name="plus" size={24} />
      </button>
    </div>
  );
}

// ============ TASK DETAIL PANEL ============
function DetailRow({ icon, label, value, placeholder, onClick, open, children, accent }) {
  const [h, setH] = React.useState(false);
  return (
    <div>
      <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: 9,
          background: h || open ? 'var(--raise)' : 'transparent' }}>
        <Icon name={icon} size={17} style={{ color: value ? (accent ? 'var(--accent)' : 'var(--ink-2)') : 'var(--ink-3)' }} />
        <span style={{ flex: 1, fontSize: 14, color: value ? 'var(--ink)' : 'var(--ink-3)' }}>{value || placeholder}</span>
      </button>
      {open && <div style={{ padding: '2px 6px 8px 40px', animation: 'fadeIn .15s ease' }}>{children}</div>}
    </div>
  );
}

function TaskDetail({ task, onUpdate, onClose, onOpenGoal }) {
  const [menu, setMenu] = React.useState(null); // 'due' | 'snooze' | 'goal'
  const [subInput, setSubInput] = React.useState('');
  if (!task) return null;
  const a = computeAging(task, 'noticeable');
  const created = new Date(task.created).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const setStatus = (s) => onUpdate(task.id, s === 'Done' ? { status: 'Done', completedAt: window.daysAgo(0) } : { status: s, completedAt: null });
  const toggleSub = (sid) => onUpdate(task.id, { subtasks: task.subtasks.map(s => s.id === sid ? { ...s, done: !s.done } : s) });
  const addSub = () => { if (subInput.trim()) { onUpdate(task.id, { subtasks: [...task.subtasks, { id: 'st' + Date.now(), title: subInput.trim(), done: false }] }); setSubInput(''); } };
  const dl = dueLabel(task.due);

  const setDue = (n) => { onUpdate(task.id, { due: n == null ? null : window.daysAhead(n) }); setMenu(null); };
  const setSnooze = (n) => { onUpdate(task.id, { snoozeUntil: n == null ? null : window.daysAhead(n) }); setMenu(null); };
  const setGoal = (gid) => { onUpdate(task.id, { goalId: gid }); setMenu(null); };

  const STATUS = [{ k: 'Open', i: 'today' }, { k: 'Done', i: 'check' }, { k: 'Dropped', i: 'dropped' }];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(20,18,15,.18)', animation: 'overlayIn .2s ease' }} />
      <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '92vw', zIndex: 41, background: 'var(--surface)',
        borderLeft: '1px solid var(--line)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', animation: 'panelIn .25s cubic-bezier(.2,.7,.2,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-2)' }}>
            <ContextDot context={task.context} size={7} /> {task.context}
            <span style={{ color: 'var(--ink-3)' }}>·</span>
            <span style={{ color: a.color }}>open {a.n} day{a.n === 1 ? '' : 's'}</span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--ink-3)', padding: 4, borderRadius: 6 }}><Icon name="x" size={18} /></button>
        </div>

        <div className="scroll" style={{ flex: 1, padding: '20px 16px 40px' }}>
          <textarea defaultValue={task.title} onBlur={(e) => onUpdate(task.id, { title: e.target.value })} rows={2}
            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 21, fontWeight: 500, lineHeight: 1.3,
              letterSpacing: '-.015em', resize: 'none', marginBottom: 6, padding: '0 12px',
              textDecoration: task.status === 'Done' ? 'line-through' : 'none', textDecorationColor: 'var(--ink-3)', color: task.status === 'Open' ? 'var(--ink)' : 'var(--ink-2)' }} />
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '0 12px', marginBottom: 16 }}>Created {created}</div>

          {/* status segmented */}
          <div style={{ display: 'flex', gap: 3, background: 'var(--surface-2)', borderRadius: 10, padding: 3, margin: '0 12px 8px' }}>
            {STATUS.map(s => (
              <button key={s.k} onClick={() => setStatus(s.k)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 0', borderRadius: 7, fontSize: 13, fontWeight: 600, transition: 'all .15s',
                background: task.status === s.k ? 'var(--surface)' : 'transparent',
                color: task.status === s.k ? (s.k === 'Dropped' ? 'var(--ink-2)' : 'var(--accent-ink)') : 'var(--ink-3)',
                boxShadow: task.status === s.k ? 'var(--shadow-sm)' : 'none' }}>
                <Icon name={s.i} size={15} /> {s.k}
              </button>
            ))}
          </div>

          <div style={{ height: 1, background: 'var(--line)', margin: '14px 12px' }} />

          <DetailRow icon="calendar" placeholder="Add due date" value={dl ? dl.text : null} accent={dl && dl.tone !== 'normal'}
            open={menu === 'due'} onClick={() => setMenu(menu === 'due' ? null : 'due')}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 9, padding: 5 }}>
              <OptionRow icon="today" label="Today" onClick={() => setDue(0)} />
              <OptionRow icon="arrowRight" label="Tomorrow" onClick={() => setDue(1)} />
              <OptionRow icon="calendar" label="In a week" onClick={() => setDue(7)} />
              {task.due && <OptionRow icon="x" label="Clear due date" danger onClick={() => setDue(null)} />}
            </div>
          </DetailRow>

          <DetailRow icon="snooze" placeholder="Snooze — hide from Today until…" value={task.snoozeUntil ? `Hidden until ${fmtDate(task.snoozeUntil)}` : null}
            open={menu === 'snooze'} onClick={() => setMenu(menu === 'snooze' ? null : 'snooze')}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 9, padding: 5 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '4px 10px 6px' }}>It stays an open task — just out of sight until then.</div>
              <OptionRow icon="arrowRight" label="Tomorrow" onClick={() => setSnooze(1)} />
              <OptionRow icon="calendar" label="Next week" onClick={() => setSnooze(7)} />
              <OptionRow icon="calendar" label="In a month" onClick={() => setSnooze(30)} />
              {task.snoozeUntil && <OptionRow icon="x" label="Un-snooze" danger onClick={() => setSnooze(null)} />}
            </div>
          </DetailRow>

          <DetailRow icon="goals" placeholder="Link to a goal" value={task.goalId ? (window.goalById(task.goalId) || {}).title : null} accent={!!task.goalId}
            open={menu === 'goal'} onClick={() => setMenu(menu === 'goal' ? null : 'goal')}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 9, padding: 5 }}>
              {GOALS.map(g => <OptionRow key={g.id} label={g.title} active={task.goalId === g.id} onClick={() => setGoal(g.id)} />)}
              {task.goalId && <OptionRow icon="x" label="Unlink" danger onClick={() => setGoal(null)} />}
            </div>
          </DetailRow>

          <div style={{ height: 1, background: 'var(--line)', margin: '14px 12px' }} />

          {/* subtasks */}
          <div style={{ padding: '0 12px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
              Subtasks {task.subtasks.length > 0 && <span style={{ color: 'var(--ink-3)' }}>· {task.subtasks.filter(s => s.done).length}/{task.subtasks.length}</span>}
            </div>
            {task.subtasks.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                <window.Checkbox checked={s.done} size={16} onClick={() => toggleSub(s.id)} />
                <span style={{ fontSize: 13.5, color: s.done ? 'var(--ink-3)' : 'var(--ink)', textDecoration: s.done ? 'line-through' : 'none', textDecorationColor: 'var(--ink-3)' }}>{s.title}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', marginTop: 2 }}>
              <Icon name="plus" size={16} style={{ color: 'var(--ink-3)' }} />
              <input value={subInput} onChange={(e) => setSubInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSub(); }}
                placeholder="Add subtask" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5 }} />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

Object.assign(window, { QuickAddInline, CommandPalette, FloatingComposer, TaskDetail });
