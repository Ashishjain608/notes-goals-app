/**
 * App shell — minimal placeholder during scaffolding (Wave 1).
 *
 * The full shell (vault gate, nav rail, top chrome, routing, theme provider) is
 * assembled during integration once the store, components, and views exist.
 * This file is owned by integration — view/spine agents must not edit it.
 */
export default function App() {
  return (
    <div data-theme="light" className="grid h-screen place-items-center bg-bg text-ink">
      <div className="text-center">
        <div className="font-serif text-2xl text-ink-2">Notes &amp; Goals</div>
        <div className="mt-2 text-sm text-ink-3">
          Scaffolding — the app shell is assembled during integration.
        </div>
      </div>
    </div>
  );
}
