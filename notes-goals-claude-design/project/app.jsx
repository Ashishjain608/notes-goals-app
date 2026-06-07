// app.jsx — shell: nav variants, routing, state, tweaks. Loaded last.
const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakToggle } = window;
const { Icon, Today, Backlog, NotesView, GoalsOverview, GoalPage, TaskDetail, QuickAddInline, CommandPalette, FloatingComposer } = window;

const ACCENTS = {
  terracotta: { name: 'Terracotta', light: ['#c2603f', '#a44e30', '194,96,63'], dark: ['#d6805f', '#e0916f', '214,128,95'] },
  slate:      { name: 'Slate blue', light: ['#3a6ea5', '#2f5d8f', '58,110,165'], dark: ['#6d9fd1', '#8fb6dd', '109,159,209'] },
  moss:       { name: 'Moss green', light: ['#3f7d5c', '#33684b', '63,125,92'], dark: ['#6aa884', '#84bb9c', '106,168,132'] },
  violet:     { name: 'Muted violet', light: ['#7a5ba6', '#664a8d', '122,91,166'], dark: ['#a487cb', '#b8a0d8', '164,135,203'] },
  ink:        { name: 'Ink only', light: ['#46433d', '#2a2824', '70,67,61'], dark: ['#cfccc4', '#e6e3db', '207,204,196'] },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "terracotta",
  "nav": "rail",
  "todayLayout": "grouped",
  "quickAdd": "inline",
  "goalLayout": "classic",
  "aging": "noticeable"
}/*EDITMODE-END*/;

const NAV = [
  { k: 'today', label: 'Today', icon: 'today' },
  { k: 'tasks', label: 'All Tasks', icon: 'tasks' },
  { k: 'notes', label: 'Notes', icon: 'notes' },
  { k: 'goals', label: 'Goals', icon: 'goals' },
];

function Brand({ small }) {
  return (
    <div style={{ width: small ? 30 : 34, height: small ? 30 : 34, borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--line)',
      display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-sm)', flexShrink: 0 }}>
      <span style={{ fontFamily: 'var(--serif)', fontSize: small ? 17 : 19, fontStyle: 'italic', color: 'var(--accent)', lineHeight: 1, marginTop: -1 }}>&amp;</span>
    </div>
  );
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button onClick={onToggle} title="Toggle theme" style={{ width: 34, height: 34, borderRadius: 9, color: 'var(--ink-2)', display: 'grid', placeItems: 'center' }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--raise)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
      <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
    </button>
  );
}

function ContextFilter({ context, setContext, counts }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', padding: 3, borderRadius: 10 }}>
      {['All', 'Office', 'Personal'].map(c => (
        <button key={c} onClick={() => setContext(c)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 7, fontSize: 13, fontWeight: 500,
          background: context === c ? 'var(--surface)' : 'transparent', color: context === c ? 'var(--ink)' : 'var(--ink-3)', boxShadow: context === c ? 'var(--shadow-sm)' : 'none', transition: 'all .15s' }}>
          {c !== 'All' && <window.ContextDot context={c} size={6} />}{c}
        </button>
      ))}
    </div>
  );
}

// ---- NAV: rail ----
function NavRail({ active, go, theme, onToggleTheme }) {
  return (
    <nav style={{ width: 66, flexShrink: 0, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 6, background: 'var(--bg)' }}>
      <div style={{ marginBottom: 12 }}><Brand /></div>
      {NAV.map(n => {
        const on = active === n.k;
        return (
          <button key={n.k} onClick={() => go(n.k)} title={n.label} style={{ width: 42, height: 42, borderRadius: 11, display: 'grid', placeItems: 'center',
            color: on ? 'var(--accent-ink)' : 'var(--ink-3)', background: on ? 'var(--accent-soft)' : 'transparent', transition: 'all .15s' }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--raise)'; }} onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
            <Icon name={n.icon} size={21} />
          </button>
        );
      })}
      <div style={{ marginTop: 'auto' }}><ThemeToggle theme={theme} onToggle={onToggleTheme} /></div>
    </nav>
  );
}

// ---- NAV: sidebar ----
function NavSidebar({ active, go, theme, onToggleTheme, counts }) {
  return (
    <nav style={{ width: 224, flexShrink: 0, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', padding: '18px 14px', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px', marginBottom: 22 }}>
        <Brand small /><span style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 500, letterSpacing: '-.01em' }}>Notes &amp; Goals</span>
      </div>
      <div style={{ display: 'grid', gap: 2 }}>
        {NAV.map(n => {
          const on = active === n.k;
          return (
            <button key={n.k} onClick={() => go(n.k)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 9, textAlign: 'left',
              color: on ? 'var(--ink)' : 'var(--ink-2)', background: on ? 'var(--surface)' : 'transparent', boxShadow: on ? 'var(--shadow-sm)' : 'none',
              border: on ? '1px solid var(--line)' : '1px solid transparent', transition: 'all .15s' }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--raise)'; }} onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
              <Icon name={n.icon} size={18} style={{ color: on ? 'var(--accent)' : 'var(--ink-3)' }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: on ? 600 : 500 }}>{n.label}</span>
              {counts[n.k] != null && <span style={{ fontSize: 12, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{counts[n.k]}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{theme === 'light' ? 'Light' : 'Dark'}</span>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </nav>
  );
}

// ---- top chrome (context filter + capture + theme; nav for topbar mode) ----
function TopChrome({ navMode, active, go, context, setContext, counts, theme, onToggleTheme, onCapture, quickAdd }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: navMode === 'topbar' ? '12px 24px' : '14px 24px', borderBottom: '1px solid var(--line)', minHeight: 60, background: 'var(--bg)' }}>
      {navMode === 'topbar' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Brand small />
          <div style={{ display: 'flex', gap: 2 }}>
            {NAV.map(n => {
              const on = active === n.k;
              return (
                <button key={n.k} onClick={() => go(n.k)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 8, fontSize: 13.5, fontWeight: on ? 600 : 500,
                  color: on ? 'var(--ink)' : 'var(--ink-2)', background: on ? 'var(--surface)' : 'transparent', boxShadow: on ? 'var(--shadow-sm)' : 'none', border: on ? '1px solid var(--line)' : '1px solid transparent' }}>
                  <Icon name={n.icon} size={16} style={{ color: on ? 'var(--accent)' : 'var(--ink-3)' }} />{n.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <button onClick={onCapture} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px 7px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--surface)',
        color: 'var(--ink-3)', fontSize: 13, boxShadow: 'var(--shadow-sm)', minWidth: navMode === 'topbar' ? 180 : 240 }}>
        <Icon name="search" size={16} /><span style={{ flex: 1, textAlign: 'left' }}>Capture or jump…</span>
        <kbd style={{ fontFamily: 'var(--mono)', fontSize: 11, border: '1px solid var(--line-2)', borderRadius: 5, padding: '1px 5px' }}>⌘K</kbd>
      </button>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <ContextFilter context={context} setContext={setContext} counts={counts} />
        {navMode === 'topbar' && <ThemeToggle theme={theme} onToggle={onToggleTheme} />}
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tasks, setTasks] = React.useState(() => window.TASKS.map(x => ({ ...x })));
  const [route, setRoute] = React.useState({ screen: 'today', id: null });
  const [context, setContext] = React.useState('All');
  const [detailId, setDetailId] = React.useState(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const acc = ACCENTS[t.accent] || ACCENTS.terracotta;
  const ac = t.theme === 'dark' ? acc.dark : acc.light;
  const accentVars = {
    '--accent': ac[0], '--accent-ink': ac[1],
    '--accent-soft': `rgba(${ac[2]},${t.theme === 'dark' ? 0.18 : 0.10})`,
    '--accent-line': `rgba(${ac[2]},0.32)`,
  };

  // handlers
  const addTask = (title, ctx) => {
    const nt = { id: 'u' + Date.now(), title, context: ctx, status: 'Open', created: new Date().toISOString(), due: null, snoozeUntil: null, goalId: null, subtasks: [] };
    setTasks(p => [nt, ...p]);
  };
  const toggleTask = (id) => setTasks(p => p.map(x => {
    if (x.id !== id) return x;
    if (x.status === 'Done') return { ...x, status: 'Open', completedAt: null };
    return { ...x, status: 'Done', completedAt: new Date().toISOString() };
  }));
  const updateTask = (id, patch) => setTasks(p => p.map(x => x.id === id ? { ...x, ...patch } : x));
  const openDetail = (id) => setDetailId(id);
  const openGoal = (id) => { setDetailId(null); setRoute({ screen: 'goal', id }); };
  const go = (screen) => { setRoute({ screen, id: null }); };

  const handlers = { onToggle: toggleTask, onOpen: openDetail, onOpenGoal: openGoal };

  // keyboard ⌘K
  React.useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const openCount = tasks.filter(x => x.status === 'Open' && !window.isSnoozed(x) && (context === 'All' || x.context === context)).length;
  const counts = {
    today: tasks.filter(x => x.status === 'Open' && !window.isSnoozed(x)).length,
    tasks: tasks.filter(x => x.status === 'Open').length,
    notes: window.NOTES.length, goals: window.GOALS.length,
  };
  const activeScreen = route.screen === 'goal' ? 'goals' : route.screen === 'note' ? 'notes' : route.screen;
  const detailTask = tasks.find(x => x.id === detailId);

  // quick-add element for Today
  let quickAddEl = null;
  if (route.screen === 'today') {
    if (t.quickAdd === 'inline') quickAddEl = <QuickAddInline context={context} onAdd={addTask} />;
    else if (t.quickAdd === 'palette') quickAddEl = (
      <button onClick={() => setPaletteOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% - 32px)', margin: '0 16px', padding: '12px 16px',
        border: '1px dashed var(--line-2)', borderRadius: 11, color: 'var(--ink-3)', fontSize: 14, background: 'transparent' }}>
        <Icon name="command" size={17} /> <span style={{ flex: 1, textAlign: 'left' }}>Capture a task</span>
        <kbd style={{ fontFamily: 'var(--mono)', fontSize: 11, border: '1px solid var(--line-2)', borderRadius: 5, padding: '1px 6px' }}>⌘K</kbd>
      </button>
    );
  }

  let screen;
  if (route.screen === 'today') screen = <Today tasks={tasks} context={context} mode={t.aging} layout={t.todayLayout} handlers={handlers} quickAddEl={quickAddEl} />;
  else if (route.screen === 'tasks') screen = <Backlog tasks={tasks} context={context} mode={t.aging} handlers={handlers} />;
  else if (route.screen === 'notes') screen = <NotesView notes={window.NOTES} context={context} onOpenGoal={openGoal} />;
  else if (route.screen === 'goals') screen = <GoalsOverview goals={window.GOALS} tasks={tasks} context={context} onOpen={openGoal} />;
  else if (route.screen === 'goal') {
    const g = window.GOALS.find(x => x.id === route.id);
    screen = <GoalPage goal={g} tasks={tasks} notes={window.NOTES} mode={t.aging} layout={t.goalLayout} handlers={handlers} onOpenGoal={openGoal} onBack={() => go('goals')} />;
  }

  const showRail = t.nav === 'rail';
  const showSidebar = t.nav === 'sidebar';
  const toggleTheme = () => setTweak('theme', t.theme === 'light' ? 'dark' : 'light');

  return (
    <div data-theme={t.theme} style={{ height: '100vh', display: 'flex', background: 'var(--bg)', color: 'var(--ink)', ...accentVars }}>
      {showRail && <NavRail active={activeScreen} go={go} theme={t.theme} onToggleTheme={toggleTheme} />}
      {showSidebar && <NavSidebar active={activeScreen} go={go} theme={t.theme} onToggleTheme={toggleTheme} counts={counts} />}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopChrome navMode={t.nav} active={activeScreen} go={go} context={context} setContext={setContext} counts={counts}
          theme={t.theme} onToggleTheme={toggleTheme} onCapture={() => setPaletteOpen(true)} quickAdd={t.quickAdd} />
        <div style={{ flex: 1, minHeight: 0 }}>{screen}</div>
      </main>

      {t.quickAdd === 'composer' && <FloatingComposer context={context} onAdd={addTask} />}
      <CommandPalette open={paletteOpen} context={context} onAdd={addTask} onClose={() => setPaletteOpen(false)} onNavigate={go} />
      {detailTask && <TaskDetail task={detailTask} onUpdate={updateTask} onClose={() => setDetailId(null)} onOpenGoal={openGoal} />}

      <TweaksPanel>
        <TweakSection label="Navigation" />
        <TweakRadio label="Nav pattern" value={t.nav} options={['rail', 'sidebar', 'topbar']} onChange={(v) => setTweak('nav', v)} />
        <TweakSection label="Today" />
        <TweakRadio label="Layout" value={t.todayLayout} options={['grouped', 'stream', 'columns']} onChange={(v) => setTweak('todayLayout', v)} />
        <TweakSelect label="Quick-add" value={t.quickAdd} options={['inline', 'palette', 'composer']} onChange={(v) => setTweak('quickAdd', v)} />
        <TweakSelect label="Aging cue" value={t.aging} options={['subtle', 'noticeable', 'escalating']} onChange={(v) => setTweak('aging', v)} />
        <TweakSection label="Goal page" />
        <TweakRadio label="Layout" value={t.goalLayout} options={['classic', 'split']} onChange={(v) => setTweak('goalLayout', v)} />
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme} options={['light', 'dark']} onChange={(v) => setTweak('theme', v)} />
        <div style={{ padding: '6px 2px 2px' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-2, #888)', marginBottom: 8, fontWeight: 500 }}>Accent</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(ACCENTS).map(([k, v]) => (
              <button key={k} onClick={() => setTweak('accent', k)} title={v.name} style={{ width: 26, height: 26, borderRadius: '50%', background: v.light[0],
                border: t.accent === k ? '2px solid var(--ink, #333)' : '2px solid transparent', outline: t.accent === k ? '1px solid ' + v.light[0] : 'none', cursor: 'pointer', boxShadow: '0 0 0 1px rgba(0,0,0,.08)' }} />
            ))}
          </div>
        </div>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
