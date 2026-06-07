// icons.jsx — minimal, geometric line icons (1.6px stroke, 24 grid)
function Icon({ name, size = 20, style = {} }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    today: <><circle cx="12" cy="12" r="8.2" {...p} /><path d="M12 7.6V12l3 1.8" {...p} /></>,
    tasks: <><path d="M5 7h14M5 12h14M5 17h9" {...p} /></>,
    notes: <><path d="M6 4h8l4 4v12H6z" {...p} /><path d="M14 4v4h4" {...p} /><path d="M9 13h6M9 16.5h4" {...p} /></>,
    goals: <><circle cx="12" cy="12" r="7.5" {...p} /><circle cx="12" cy="12" r="3.4" {...p} /></>,
    search: <><circle cx="11" cy="11" r="6" {...p} /><path d="m20 20-3.6-3.6" {...p} /></>,
    plus: <><path d="M12 5.5v13M5.5 12h13" {...p} /></>,
    check: <><path d="m5 12.5 4.5 4.5L19 7" {...p} /></>,
    moon: <><path d="M19 13.5A7 7 0 1 1 10.5 5a5.6 5.6 0 0 0 8.5 8.5Z" {...p} /></>,
    sun: <><circle cx="12" cy="12" r="4" {...p} /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" {...p} /></>,
    chevron: <><path d="m9 6 6 6-6 6" {...p} /></>,
    chevronDown: <><path d="m6 9 6 6 6-6" {...p} /></>,
    clock: <><circle cx="12" cy="12" r="8" {...p} /><path d="M12 8v4.2l3 1.8" {...p} /></>,
    snooze: <><path d="M14 5h5l-5 6h5" {...p} transform="translate(-1 1) scale(0.9)" /><path d="M4 13h4l-4 5h4" {...p} transform="translate(2 0)" /></>,
    calendar: <><rect x="4" y="5.5" width="16" height="14" rx="2" {...p} /><path d="M4 9.5h16M8 3.5v3M16 3.5v3" {...p} /></>,
    link: <><path d="M10 14a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 7.3" {...p} /><path d="M14 10a4 4 0 0 0-5.7 0L6 12.3a4 4 0 0 0 5.7 5.7L13 16.7" {...p} /></>,
    settings: <><circle cx="12" cy="12" r="2.8" {...p} /><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" {...p} /></>,
    x: <><path d="M6 6l12 12M18 6 6 18" {...p} /></>,
    dropped: <><circle cx="12" cy="12" r="8" {...p} /><path d="M8.5 12h7" {...p} /></>,
    arrowRight: <><path d="M5 12h14M13 6l6 6-6 6" {...p} /></>,
    inbox: <><path d="M4 13l2.5-7h11L20 13v5H4z" {...p} /><path d="M4 13h4l1.5 2.5h5L16 13h4" {...p} /></>,
    dot: <><circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" /></>,
    flame: <><path d="M12 3.5c2.5 3 4.5 5 4.5 8a4.5 4.5 0 1 1-9 0c0-1.4.6-2.6 1.6-3.6.2 1 .8 1.8 1.6 2 .1-2.3.6-4.4 1.3-6.4Z" {...p} /></>,
    command: <><path d="M9 9V7a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v2m0 6v2a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2v-2m0-6h6v6H9z" {...p} /></>,
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block', flexShrink: 0, ...style }} aria-hidden="true">
      {paths[name] || null}
    </svg>
  );
}
Object.assign(window, { Icon });
