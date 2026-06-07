// notesgoals.jsx — Notes editor, Goals overview, Goal page (2 variants).
const { Icon, ContextDot, ProgressBar, TaskRow, GoalChip, fmtDate } = window;

function goalProgress(goalId, tasks) {
  const linked = tasks.filter(t => t.goalId === goalId && t.status !== 'Dropped');
  const done = linked.filter(t => t.status === 'Done').length;
  return { done, total: linked.length, linked };
}

// ---------- shared content renderer (serif, WYSIWYG-styled) ----------
function NoteBody({ blocks, editable }) {
  return (
    <div contentEditable={editable} suppressContentEditableWarning style={{
      fontFamily: 'var(--serif)', fontSize: 18, lineHeight: 1.62, color: 'var(--ink)', outline: 'none', letterSpacing: '.002em',
    }}>
      {blocks.map((b, i) => {
        if (b.t === 'h') return <h3 key={i} style={{ fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-2)', margin: '26px 0 10px' }}>{b.x}</h3>;
        if (b.t === 'li') return <div key={i} style={{ display: 'flex', gap: 12, margin: '7px 0' }}><span style={{ color: 'var(--accent)', marginTop: 1 }}>·</span><span style={{ flex: 1 }}>{b.x}</span></div>;
        return <p key={i} style={{ margin: '0 0 14px' }}>{b.x}</p>;
      })}
    </div>
  );
}

// ============ NOTES ============
function NotesView({ notes, context, onOpenGoal }) {
  const inCtx = (n) => context === 'All' || n.context === context;
  const visible = notes.filter(inCtx);
  const [selId, setSel] = React.useState(visible[0] ? visible[0].id : null);
  const [q, setQ] = React.useState('');
  React.useEffect(() => { if (!visible.find(n => n.id === selId)) setSel(visible[0] ? visible[0].id : null); }, [context]);
  const filtered = visible.filter(n => !q || n.title.toLowerCase().includes(q.toLowerCase()) || n.excerpt.toLowerCase().includes(q.toLowerCase()));
  const sel = notes.find(n => n.id === selId);

  return (
    <div style={{ height: '100%', display: 'flex' }}>
      {/* list */}
      <div className="scroll" style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--line)', padding: '28px 0 60px' }}>
        <div style={{ padding: '0 22px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent-ink)', marginBottom: 8 }}>Notes</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 9, padding: '8px 11px' }}>
            <Icon name="search" size={16} style={{ color: 'var(--ink-3)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5 }} />
          </div>
        </div>
        <div style={{ padding: '0 12px' }}>
          {filtered.map(n => {
            const active = n.id === selId;
            return (
              <button key={n.id} onClick={() => setSel(n.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 12px', borderRadius: 10,
                background: active ? 'var(--raise)' : 'transparent', marginBottom: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <ContextDot context={n.context} size={6} />
                  <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.excerpt}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>{window.ageInDays(n.updated)}d ago</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* editor */}
      <div className="scroll" style={{ flex: 1, padding: '0 0 80px' }}>
        {sel ? (
          <div style={{ maxWidth: 660, margin: '0 auto', padding: '0 40px' }}>
            {/* WYSIWYG toolbar */}
            <div style={{ position: 'sticky', top: 0, background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 2, padding: '16px 0 12px', zIndex: 2 }}>
              {[['B', { fontWeight: 700 }], ['I', { fontStyle: 'italic', fontFamily: 'var(--serif)' }]].map(([l, st], i) => (
                <button key={i} style={{ width: 32, height: 30, borderRadius: 7, fontSize: 14, color: 'var(--ink-2)', ...st }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--raise)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>{l}</button>
              ))}
              {['H', 'tasks', 'link'].map((k, i) => (
                <button key={i} style={{ width: 32, height: 30, borderRadius: 7, color: 'var(--ink-2)', display: 'grid', placeItems: 'center', fontSize: 13.5, fontWeight: 600 }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--raise)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  {k === 'H' ? 'H' : <Icon name={k} size={15} />}</button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink-3)', fontStyle: 'italic' }}>No markdown — just write</span>
            </div>

            <div style={{ paddingTop: 14 }}>
              <div className="mline" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}><ContextDot context={sel.context} size={7} /> {sel.context}</div>
                {sel.goalId && <><span style={{ color: 'var(--ink-3)' }}>·</span><GoalChip goalId={sel.goalId} onOpen={onOpenGoal} /></>}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>Edited {window.ageInDays(sel.updated)}d ago</span>
              </div>
              <h1 contentEditable suppressContentEditableWarning style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 36, lineHeight: 1.1, margin: '0 0 18px', letterSpacing: '-.015em', outline: 'none' }}>{sel.title}</h1>
              <NoteBody blocks={sel.body} editable />
            </div>
          </div>
        ) : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--ink-3)' }}>No notes in this context yet.</div>}
      </div>
    </div>
  );
}

// ============ GOALS OVERVIEW ============
function GoalsOverview({ goals, tasks, context, onOpen }) {
  const inCtx = (g) => context === 'All' || g.context === context;
  const list = goals.filter(inCtx);
  return (
    <div className="scroll" style={{ height: '100%', padding: '40px 0 120px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 40px' }}>
        <header style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent-ink)', marginBottom: 8 }}>Goals</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 32, margin: 0, letterSpacing: '-.01em' }}>What I'm working toward</h1>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {list.map(g => {
            const p = goalProgress(g.id, tasks);
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            return (
              <button key={g.id} onClick={() => onOpen(g.id)} style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow-sm)', transition: 'transform .15s, box-shadow .15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none'; }}>
                <div className="mline" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <ContextDot context={g.context} size={7} />
                  <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{g.context}</span>
                  {g.target && <><span style={{ color: 'var(--ink-3)' }}>·</span><span style={{ fontSize: 12, color: 'var(--ink-2)' }}>by {fmtDate(g.target)}</span></>}
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 21, fontWeight: 500, letterSpacing: '-.01em', marginBottom: 8, lineHeight: 1.15 }}>{g.title}</div>
                <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 16, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{g.desc}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ProgressBar value={p.done} total={p.total} />
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{p.done}/{p.total}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============ GOAL PAGE (variants: classic | split) ============
function GoalPage({ goal, tasks, notes, mode, layout, handlers, onOpenGoal, onBack }) {
  const p = goalProgress(goal.id, tasks);
  const linkedNotes = notes.filter(n => n.goalId === goal.id);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const openTasks = p.linked.filter(t => t.status === 'Open');
  const doneTasks = p.linked.filter(t => t.status === 'Done');

  const Back = () => (
    <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-2)', marginBottom: 20 }}>
      <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} /> Goals
    </button>
  );

  const Meta = () => (
    <div className="mline" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 13, color: 'var(--ink-2)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ContextDot context={goal.context} size={7} /> {goal.context}</span>
      <span style={{ color: 'var(--ink-3)' }}>·</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontWeight: 600, fontSize: 12 }}>{goal.status}</span>
      {goal.target && <><span style={{ color: 'var(--ink-3)' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="calendar" size={13} /> Target {fmtDate(goal.target)}</span></>}
    </div>
  );

  const Title = ({ size }) => <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: size, lineHeight: 1.08, margin: '0 0 14px', letterSpacing: '-.015em' }}>{goal.title}</h1>;
  const Desc = () => <p style={{ fontFamily: 'var(--serif)', fontSize: 18, lineHeight: 1.6, color: 'var(--ink-2)', margin: '0 0 6px', maxWidth: 600 }}>{goal.desc}</p>;

  const ProgressCard = ({ inline }) => (
    <div style={{ background: inline ? 'transparent' : 'var(--surface)', border: inline ? 'none' : '1px solid var(--line)', borderRadius: 14, padding: inline ? 0 : 18, boxShadow: inline ? 'none' : 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Progress</span>
        <span style={{ fontSize: 13, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}><strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.done}</strong> of {p.total} done</span>
      </div>
      <ProgressBar value={p.done} total={p.total} height={7} />
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>{pct}% · updates live as you complete linked tasks</div>
    </div>
  );

  const TaskList = () => (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4, padding: '0 16px' }}>Linked tasks · {p.total}</div>
      {openTasks.map(t => <TaskRow key={t.id} task={t} mode={mode} {...handlers} onOpenGoal={onOpenGoal} />)}
      {doneTasks.length > 0 && <div style={{ marginTop: 14 }}>{doneTasks.map(t => <TaskRow key={t.id} task={t} mode={mode} dense {...handlers} onOpenGoal={onOpenGoal} />)}</div>}
      {p.total === 0 && <div style={{ padding: '14px 16px', fontSize: 13.5, color: 'var(--ink-3)', fontStyle: 'italic' }}>No tasks linked yet. Link tasks from their detail panel and they'll gather here.</div>}
    </div>
  );

  const NotesList = ({ compact }) => (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8, padding: compact ? 0 : '0 16px' }}>Notes · {linkedNotes.length}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {linkedNotes.map(n => (
          <div key={n.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 11, padding: '13px 15px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, letterSpacing: '-.01em' }}>{n.title}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>{n.excerpt}</div>
          </div>
        ))}
        {linkedNotes.length === 0 && <div style={{ fontSize: 13.5, color: 'var(--ink-3)', fontStyle: 'italic', padding: compact ? 0 : '0 16px' }}>This goal owns no notes yet.</div>}
      </div>
    </div>
  );

  if (layout === 'split') {
    return (
      <div className="scroll" style={{ height: '100%', padding: '40px 0 120px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 40px' }}>
          <Back />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 44, alignItems: 'start' }}>
            <div style={{ minWidth: 0 }}>
              <Meta /><Title size={38} /><Desc />
              <div style={{ height: 1, background: 'var(--line)', margin: '28px 0 18px' }} />
              <div style={{ marginLeft: -16 }}><TaskList /></div>
            </div>
            <div style={{ display: 'grid', gap: 26, position: 'sticky', top: 0 }}>
              <ProgressCard />
              <NotesList compact />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // classic (stacked)
  return (
    <div className="scroll" style={{ height: '100%', padding: '40px 0 120px' }}>
      <div style={{ maxWidth: 660, margin: '0 auto', padding: '0 40px' }}>
        <Back />
        <Meta /><Title size={40} /><Desc />
        <div style={{ margin: '28px 0' }}><ProgressCard /></div>
        <div style={{ marginLeft: -16, marginBottom: 36 }}><TaskList /></div>
        <div style={{ height: 1, background: 'var(--line)', margin: '0 0 24px' }} />
        <NotesList />
      </div>
    </div>
  );
}

Object.assign(window, { NotesView, GoalsOverview, GoalPage, goalProgress });
