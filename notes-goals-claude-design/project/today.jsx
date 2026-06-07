// today.jsx — the hero screen. Three layout variations.
const { TaskRow, Pill, ContextDot, TODAY } = window;

function isSnoozed(t) { return t.snoozeUntil && new Date(t.snoozeUntil) > window.TODAY; }
function isDoneToday(t) {
  if (t.status !== 'Done' || !t.completedAt) return false;
  const c = new Date(t.completedAt), d = window.TODAY;
  return c.toDateString() === d.toDateString();
}
function byAge(a, b) { return new Date(a.created) - new Date(b.created); } // oldest first → surfaces aging

function SectionLabel({ children, count, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 16px', marginBottom: 2 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: accent ? 'var(--accent-ink)' : 'var(--ink-3)' }}>{children}</span>
      {count != null && <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
    </div>
  );
}

function CompletedGroup({ tasks, mode, handlers }) {
  if (!tasks.length) return null;
  return (
    <div style={{ marginTop: 22 }}>
      <SectionLabel count={tasks.length}>Completed today</SectionLabel>
      <div>{tasks.map(t => <TaskRow key={t.id} task={t} mode={mode} dense {...handlers} />)}</div>
    </div>
  );
}

function ContextHeader({ context }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 16px', marginBottom: 2 }}>
      <ContextDot context={context} size={8} />
      <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>{context}</span>
    </div>
  );
}

function Today({ tasks, context, mode, layout, handlers, quickAddEl }) {
  // open + not snoozed, within current context
  const inCtx = (t) => context === 'All' || t.context === context;
  const open = tasks.filter(t => t.status === 'Open' && !isSnoozed(t) && inCtx(t)).sort(byAge);
  const office = open.filter(t => t.context === 'Office');
  const personal = open.filter(t => t.context === 'Personal');
  const completed = tasks.filter(t => isDoneToday(t) && inCtx(t));
  const oldest = open.length ? window.ageInDays(open[0].created) : 0;

  const dateStr = window.TODAY.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const groupHandlers = handlers;
  const showCtx = context === 'All';

  let body;
  if (layout === 'stream') {
    body = (
      <div>
        {open.length === 0 && <Empty />}
        <div>{open.map(t => <TaskRow key={t.id} task={t} mode={mode} showContext {...groupHandlers} />)}</div>
        <CompletedGroup tasks={completed} mode={mode} handlers={groupHandlers} />
      </div>
    );
  } else if (layout === 'columns' && context === 'All') {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div>
          <ContextHeader context="Office" />
          {office.length ? office.map(t => <TaskRow key={t.id} task={t} mode={mode} {...groupHandlers} />) : <MiniEmpty />}
        </div>
        <div>
          <ContextHeader context="Personal" />
          {personal.length ? personal.map(t => <TaskRow key={t.id} task={t} mode={mode} {...groupHandlers} />) : <MiniEmpty />}
        </div>
        <div style={{ gridColumn: '1 / -1' }}><CompletedGroup tasks={completed} mode={mode} handlers={groupHandlers} /></div>
      </div>
    );
  } else {
    // grouped (default)
    body = (
      <div>
        {open.length === 0 && <Empty />}
        {(context === 'All' || context === 'Office') && office.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            {context === 'All' && <ContextHeader context="Office" />}
            {office.map(t => <TaskRow key={t.id} task={t} mode={mode} {...groupHandlers} />)}
          </div>
        )}
        {(context === 'All' || context === 'Personal') && personal.length > 0 && (
          <div>
            {context === 'All' && <ContextHeader context="Personal" />}
            {personal.map(t => <TaskRow key={t.id} task={t} mode={mode} {...groupHandlers} />)}
          </div>
        )}
        <CompletedGroup tasks={completed} mode={mode} handlers={groupHandlers} />
      </div>
    );
  }

  return (
    <div className="scroll" style={{ height: '100%', padding: '40px 0 120px' }}>
      <div style={{ maxWidth: layout === 'columns' && context === 'All' ? 880 : 640, margin: '0 auto', padding: '0 24px' }}>
        <header style={{ padding: '0 16px', marginBottom: 26 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent-ink)', marginBottom: 8 }}>Today</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 34, lineHeight: 1.05, margin: 0, letterSpacing: '-.01em' }}>{dateStr}</h1>
          <div style={{ marginTop: 10, fontSize: 13.5, color: 'var(--ink-2)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}><strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{open.length}</strong> open</span>
            {oldest >= 5 && <span style={{ color: 'var(--accent-ink)', whiteSpace: 'nowrap', flexShrink: 0 }}>oldest has waited {oldest} days</span>}
            {completed.length > 0 && <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{completed.length} done today</span>}
          </div>
        </header>
        {quickAddEl}
        <div style={{ marginTop: 18 }}>{body}</div>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink-2)', marginBottom: 6 }}>Nothing waiting on you.</div>
      <div style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>Open tasks appear here automatically until you finish or drop them.</div>
    </div>
  );
}
function MiniEmpty() {
  return <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>All clear.</div>;
}

Object.assign(window, { Today, isSnoozed, isDoneToday });
