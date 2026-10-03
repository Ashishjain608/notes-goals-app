# The phone shell is bottom-anchored

Amends the phone half of [ADR-0011](0011-own-storage-sync-and-phone-app.md), which gave the phone the full app in a phone layout. This ADR covers how that layout works. The Mac app is unchanged.

The first phone layout reused the desktop shell. It had a title bar and a 5-tab bar, and the views were squeezed to fit. On an iPhone every action that creates, closes or filters sat in the top third of the screen. Filing a note was drag-only, so it didn't work on touch. The editor's formatting toolbar sat at the top while the keyboard covered the bottom half. Touch-accuracy research (Hoober: about 7 mm at the centre against 12 mm in the corners) and the visible-navigation findings (NN/g: hidden navigation costs 15% in time and over 20% in discoverability) both point the same way: put the controls where the thumb is. The design that came out of the exploration is "Final 2" on the design canvas.

## Decisions

**The phone gets its own shell, rendered when `useIsPhone()` is true.** `App.tsx` already branches on it. On the phone, `TitleBar`, `BottomBar` and the More sheet are replaced by `src/shell/phone/`. Each view's phone layout is a separate component chosen at the view root, so desktop markup is not edited. Shared components gain phone behaviour only through new props that default to today's output, or through `max-md:` classes.

**Navigation is a floating 4-tab bar with search beside it: Today · Tasks · Notes · Goals, then a round Search button.** Activity, Settings, the theme and the global context filter move into a sheet opened from a context avatar in each page header. That avatar is the one top-corner control, and it is for rare actions.

**One add button opens a menu (Task · Note · Checklist · Goal), and the menu opens a composer above the keyboard.** The composer reads natural language for dates, context and goal, and shows what it parsed as chips. Parsing is a local pure function with no dependency. There is no Library tab, because Notes and Goals keep their own tabs.

**Phone overlays join browser history.** Opening a sheet, the composer, search, the editor or a goal page pushes a history entry, and `popstate` closes it. iOS's edge swipe-back in a Home Screen app then closes the top layer instead of leaving the app. Desktop has no history integration and gets none.

**On the phone, reversible actions act at once and offer Undo.** Completing, dropping, committing and snoozing a task are already reversible by value, so a toast restores the previous value. Deleting stays behind a confirmation until the backend has a restore path. The Mac keeps its current behaviour.

**No gesture or animation library.** CSS transitions and pointer events cover the design, in line with the build contract (no new npm dependencies). Swipe actions are deferred. When they come, each one must have a visible equivalent, and nothing may start at the left screen edge.

**Glass only on fixed chrome.** The translucent, blurred fill is used on the tab bar, the search button, sheets, the composer and the format pill. It is never used on list rows, because WebKit's `backdrop-filter` inside scrolling containers is slow and can blank the scroller. Glass, scrim and personal-tint colours are design tokens with light and dark values.

## Consequences

- The store gains phone-safe options rather than phone forks:
  - `addTask(input, { openDetail })` defaults to opening the detail panel, as today.
  - `TaskPatch` gains `context`.
  - There is an `undo` slice holding one pending toast.
  - Desktop call sites are unchanged.
- The keyboard is handled through `visualViewport`, because iOS overlays the keyboard on the layout viewport rather than resizing it. A store-free `useKeyboardInset()` lifts the composer, search field and format pill.
- A Pinned section needs a `pinned` field on Note. That is a vault-format change: `#[serde(default)]` in Rust, both backends and both fixture sets. It ships as its own step, or not at all, by the maintainer's call.
- Attaching files from the phone stays out of scope (ADR-0011). The phone toolbar has no attach button.
- The phone app deploys when anything is merged to `main`. Each phase is merged only when the phone app is complete and working at that phase.
