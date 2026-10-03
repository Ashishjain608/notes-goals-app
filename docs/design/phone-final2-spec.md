# Notes & Goals mobile: Final 2 build spec

Canvas 390x844. Top 47px safe area (no status bar drawn). Bottom 34px home-indicator zone (indicator 134x5, r3, ink, 8px from bottom). Fonts: UI Hanken Grotesk, display/note body Newsreader. Source: the design canvas, page "Final (B × C)", artboards F2-* plus F1-Task, F1-Notes, F1-Editor, F1-Goals, F1-Search, F1-Add. Plan: [../phone-redesign-plan.md](../phone-redesign-plan.md). No Undo toast and no Settings/Activity screen is drawn anywhere.

Shorthand: GLASS = `bg rgba(255,255,255,.72); backdrop-filter blur(20px); box-shadow inset 0 0 0 1px rgba(217,220,228,.8), 0 1px 2px rgba(40,40,90,.05), 0 16px 38px -16px rgba(40,40,90,.18)`. ink@6 = rgba(28,34,48,.06).

## 1. Component inventory

**GlassTabBar** (F2: Today, Tasks, Notes, Goals; F1 has 3 tabs). Pill at left:12 right:12 bottom:34, h52, r26, padding 2, GLASS. 4 tabs flex:1 (about 73px each), gap 2, h48, r24, min-width 56. Icon 20 stroke 1.75 above label 12px. Inactive: transparent, ink-2, weight 500. Active (`aria-current=page`): accent-soft bg, accent-ink, weight 600. Lives in a row with SearchButton (gap 10).

**SearchButton**: 52x52 circle, GLASS, ink icon 22. Right of the tab pill. On tap it grows into the search field (see Search).

**Fab**: 60x60, r18 (squircle), accent bg, white plus icon 26 stroke 2. right:16 bottom:100 (y 684-744, 14px above the footer). Shadow `0 1px 2px rgba(40,40,90,.10), 0 12px 28px -12px rgba(79,70,229,.55)`. F2 screens: always opens FabMenu. F1 screens: contextual (New note / New goal). Used on Today, Tasks (F1 Notes, Goals).

**FabMenu** (menu open): scrim over everything, then a column of 4 pills, right:16, bottom:172, gap 8, right-aligned, order top-down Goal, Checklist, Note, Task (Task nearest the thumb). Pill: h56, padding 0 24 0 18, r999, 17px/600, icon 22 in accent, shadow `0 1px 2px rgba(40,40,90,.08), 0 12px 28px -14px rgba(20,18,15,.35)`. Goal/Checklist/Note: surface bg, ink text. Task (primary): bg #e9e8fc (opaque accent-soft on white), 1.5px border accent-line, accent-ink text and icon. Close button: 56x56 circle, accent, X icon 24, right:18 bottom:102 (same centre as the Fab, radius 18 to 999).

**Scrim**: inset 0, rgba(20,18,15,.28). Tap closes.

**Composer** (F2-Add shows Note mode; F1-Add shows Task mode). Card: left/right 12, bottom 346 (10px above the 336px keyboard), r28, GLASS. F2 padding 6/14/14, gap 12. F1 padding 18/14/14, gap 14. Contents top to bottom:
- Note mode only: header row with "Quick note" (13/600 ink-2) and "Open full editor" link-button (h44, 14/600 accent-ink, chevron 16).
- Text: Task = single field 19px ink. Note = title Hanken 19/600 over body Newsreader 18/1.5. Caret accent 2x22.
- ParsedChip row (flex-wrap, gap 8). FilingChip row (below).
- Footer row: SegmentedControl (Task/Note/Goal) at left, CommitButton at right.
- Task mode only: "Add to slate · 4 of 5" toggle pill sits above the card. Pill is h44, r22, right-aligned, GLASS, 14/600 accent-ink, 20px accent check disc, "· 4 of 5" in ink-2 weight 500.

**ParsedChip** (inline highlight in the text): padding 1/5, r6, accent-soft bg and accent-ink for dates, personal-soft bg and personal text for `#personal`. In a note, a `#tag` uses ink@6 bg and ink-2 text.

**FilingChip / action chip** (h44, r22, 15/500, padding about 0 2 0 14-16, 44x44 remove-x):
- Set date (accent-soft, accent-ink).
- Set context (Office = accent-soft with hollow-ring dot; Personal = personal-soft with filled dot, text #059669).
- Set notebook (ink@6 with "Notebook:" prefix in ink-2).
- Empty Goal (transparent, inset 1px line-2, ink-2, plus-circle icon 16).

**SegmentedControl**: track ink@6, r24. Composer variant h48, padding 2, segments h44, padding 0 18, r22, 15px. Tasks variant (Open/Done/Dropped) h44, no padding, segments 0 20. Selected: surface bg, 600 weight, ink, shadow `0 1px 2px rgba(40,40,90,.06)` (Tasks variant adds inset 1px line). Unselected: transparent, ink-2, 500.

**CommitButton** (composer Save): 44x44, r22, accent bg, white check 22. Labels "Save task" / "Save note".

**Header** (Today/Tasks): title Newsreader 30/500, letter-spacing -.01em, line-height 1.15. Subline 14px ink-2 (Today: "3 of 5 committed · 2 done"; Tasks: "10 open · 3 of 5 committed today"). Left padding 4. Right: **ContextAvatar**, a 44x44 button holding a 36px svg (white disc, half indigo/half emerald ring stroke 3, "All"/"Off"/"Per" 12/600). It is the global filter and the only entry to Activity and Settings.

**SlotMeter**: 5 pills 44x8, r999, gap 6, margin-top 14. Filled accent, empty #e2e4ec (off-token). Trailing "2 open" 13px ink-2.

**SlateCard** (committed, Today): surface, r16, min-h68, padding 6/14/6/4, shadow `0 1px 2px rgba(40,40,90,.06), 0 8px 20px -14px rgba(40,40,90,.18)`. Checkbox is a 44x44 button with a 26px ring (1.75px ink-3). Title 16/600 on one line, ellipsis. Meta row 13px ink-2: 9px context dot, "Due today · goal ·" plus age (amber #d97706/600 for 3-6d, red #dc2626 for 7d+). Whole text area is a button.

**TaskRowCompact** (Available, Tasks): surface, r12, shadow small, min-h52 (title only) or 60 (with meta). Padding 4/14/4/2, checkbox ring 22 inside 44. Title 16/400, meta 13 ink-2 (overdue = red 600). Tasks variant: padding-right 6 plus a trailing 44x44 **SlateToggle** circle. Off = accent-soft bg, accent-ink calendar icon. On = accent bg, white icon, `aria-pressed=true`, meta begins "On today ·".

**SectionHeader** (4 flavours in F2):
- "Available" 17/600 with count 14 ink-2, margin 26 top.
- Context subhead 13/600 ink-2 with dot, margin 12-16/8.
- Goal group (Tasks): goal icon 18 ink-2, 15/600 title, right "4 of 7 done" 13 ink-2, margin 20-22 top, 8 bottom. "No goal" uses a dashed circle.
- F1 uppercase label: 13/600, tracking .06em, ink-2, padding 0 8 10.

**ChipStrip** (Tasks filters): one horizontal row bleeding to the right edge (margin-right -16), gap 8. Chips are h44, r22, padding 0 14, surface bg, inset 1px line-2, 14/500 ink, icon 16 ink-2, `aria-pressed`. Chips: Due soon, Snoozed, Linked to goal, Office, Personal. Active state not drawn.

**NotebookShelf** (F1-Notes): horizontal strip, cards 128x96, r16, padding 14, icon 20 top and name 16/600 plus count 13 bottom. Surface + small shadow. "Unfiled" is transparent with inset 1.5px line-2.

**NoteCard**: full width, surface, r16, padding 14/16, gap 6. Title 16/600, preview Newsreader 15/1.45 ink-2 clamped to 2 lines, meta 13 ink-2 with context dot and "Notebook · Goal · age".

**GoalRow** (F1-Goals): card r16, padding 16, gap 10. Row 1: dot, 17/600 title, "by Oct 15" 13. Row 2: "Next:" 14 ink-2 (the label is ink 600). Row 3: **ProgressBar** (h4, r2, track surface-2, fill accent, tabular "4/7" 13). On hold: transparent, inset 1px line-2, grey fill #9aa3b2, ink-2 text.

**TaskSheet** (F1-Task): BottomSheet from y270 to bottom, r24 top, padding 0 16 34, bg rgba(255,255,255,.94) + blur 20. Grabber 36x5 line-2 at 6px. Top row h44: "Office · Slot 2 of 5" 13 ink-2 and Done 17/600 accent-ink. Then a 44px checkbox (24 ring) with an 21/600 title. Then a 4-up grid of **ActionTile**: 64x64 r18, surface-2, 24px icon, 13px label below. Committed tile is accent-soft with inset accent-line, Newsreader 28 slot number, label accent-ink. Then "SUBTASKS" label with "2 of 3". Subtask rows are 46px with a 44px hit and 22px ring (done = accent disc + line-through ink-2). "Add subtask" row in accent-ink. Notes input h48, r12, surface-2, Newsreader 17.

**FormatToolbar** (F1-Editor): GLASS pill, left/right 12, bottom 344 (above the keyboard), h48, padding 2/4, r24. 7 equal 44px-high buttons: Aa, B, I, bullets (active = accent-soft), checklist, link, attach, insert. Contents of the editor FilingChip: surface-2 h34 pill, "Product · Q3 board deck · o Office" 14/500, centred in a 44px-high button.

**SearchResults** (F1-Search): GLASS field at bottom 346: h52, r26, inset 1.5px accent-line, 17px input, clear 44 and Cancel (17/600 accent-ink, h52). Results sit above it, bottom-anchored (`justify-content:flex-end`), from y47 to bottom 404. Per kind, a section label with count, then a group card (surface, r16, divider 1px line, rows min-h48 for tasks/goals, 56 for notes). The match highlight is accent-soft bg, r4, accent-ink 600. Task rows use a 20px ring.

**UndoToast**: not drawn. See section 4.

## 2. Per-screen layout

**Today** (F2-Today). Scrolling column at top 47, padding 12/16/0. Approximate y: header 59-117; meter 131-139; slate cards from 155 (3 x 68, gap 8, ends 375); "Available" 401; Office group, then Personal group (rows 52/60, gap 6) running past 760. Fixed layers, bottom to top: scroll column, scroll-edge fade (bottom 0, h230, linear-gradient from rgba(bg,0) via .9 at 55% to bg), Fab (y684-744), GlassTabBar+Search (y758-810), home indicator. The list must pad its bottom to at least 176px plus safe area, which is the Fab top at 684 plus 16. Mockups use no padding, so the last row hides under the fade.

**Menu** (F2-Menu). Today is inert (`aria-hidden`) and everything sits under the scrim, including the footer. Top layers: FabMenu column (bottom 172, so its lowest pill ends at y616), then Close button over the Fab position.

**Add** (F2-Add). Underlay is Today with no footer and no Fab. Layers: scrim, composer card (bottom 346), keyboard 336 (`#d4d6dd`). The card's height is about 300 here, so it ends near y190. Footer and Fab are hidden while the composer is open.

**Tasks** (F2-Tasks). Same chrome as Today. Header 59-117, Status segmented ≈133-177, ChipStrip ≈189-233, then goal groups from ≈255. All of that scrolls; the nothing-sticky layout means the segmented and chips scroll away. Same 176px bottom padding rule.

**Task sheet** (F1-Task). Scrim over dimmed Today, sheet y270-844. Content is not shown scrolling. When the keyboard opens for Notes or Add subtask, the sheet has to shrink or scroll. No Fab or footer.

**Notes** (F1-Notes): top padding 67 (title 32), Notebook shelf, Pinned, Recent; fade h110; Fab + footer as Today.

**Editor** (F1-Editor): white page, header row at top 47 h48, scroll body from y103 to bottom 336, toolbar at bottom 344, keyboard. No footer or Fab.

**Goals** (F1-Goals): title 32 at 67, Active then On hold, fade h110, Fab + footer.

**Search** (F1-Search): no footer, results region y47-(844-404), field at bottom 346, keyboard.

## 3. Interactions

- Fab tap: Fab morphs into Close (60 to 56 circle), scrim fades in, the menu pills rise from the Fab. Tap scrim or Close dismisses. Menu Task opens the Composer in Task mode, Note opens Note mode (F2-Add), Goal opens Goal mode. Checklist has no composer drawn.
- The composer replaces the menu (the Fab "morphs into this card" per F1 comment), keyboard up, field focused. Segmented switches mode in place. CommitButton saves and closes.
- Typing "tomorrow" or "#personal" creates ParsedChips. The chip body edits, x removes it.
- "Open full editor" goes to the Editor with the typed title/body.
- Checkbox completes the task instantly (needs UndoToast).
- Slate card body and Available row body open TaskSheet. TaskSheet tiles: Committed toggles the slot, Snooze opens a date choice (not drawn), Due and Goal open pickers (not drawn). Done closes the sheet.
- SlateToggle on Tasks commits or removes from today. A rejection at 5 of 5 is not drawn.
- ContextAvatar cycles or opens All/Office/Personal and the Activity/Settings menu (label says so, no screen).
- Search button grows into the field, results update live. Cancel restores the footer.
- Editor: filing chip opens a filing control (not drawn), the toolbar sits above the keyboard.
- Notebook card filters Notes. Goal row opens a goal page (not drawn).

## 4. Inconsistencies and violations

1. **Footer**: F1 Notes/Goals have 3 tabs (Today, Notes, Goals), no Tasks, and wrap the tab row in a flex-column that has no purpose. Tabs lack `min-width:56`. F2 has 4 tabs. Build the F2 version.
2. **Fade height**: 230px (F2) vs 110px (F1 Notes/Goals). Pick one tied to the real chrome height (Fab top 744, footer top 758).
3. **Fab**: F2 always opens the menu. F1 Notes/Goals Fab is contextual. F2 Notes and Goals screens do not exist, so the menu-from-every-screen rule is unproven there. The menu morph also changes right inset (16 to 18) and radius, so animate carefully.
4. **Page header metrics**: F2 titles 30px at y59. F1 Notes/Goals 32px at y67 with 15px subline. F1-Task/Add underlays use 36px meter segments, "3 of 5" next to them and 55px top padding, a stale Today.
5. **Section header**: F2 "Available" 17/600 ink vs F1 uppercase 13px labels. Goal group uses a third style.
6. **Checkbox ring size**: 26 (slate), 22 (rows), 24 (sheet), 20 (search). All sit in 44px hit boxes. OK for targets, but standardise visible sizes.
7. **Rows**: Today rows pad-right 14, Tasks rows pad-right 6 (for the toggle). Heights 52/60/68 vary by meta. The Today rows meta is shown only when present.
8. **Composer**: F2 header "Quick note" vs F1 "Add to slate" pill above. Task mode must combine both. Goal mode and Checklist mode are not drawn. The segmented control has no Checklist.
9. **Off-token values**: #e2e4ec (meter empty), #e9e8fc (menu Task pill), ink@6, #d4d6dd and #8a909c (keyboard, mock only), #d9dce4 chip outlines (this is line-2).
10. **Top-corner only controls**: ContextAvatar (top-right) is the sole route to Activity, Settings and the global filter. Editor Back (top-left) and More (top-right), and TaskSheet Done (top-right, though scrim tap and grab also close). Provide bottom-reachable alternates.
11. **Undo toast**: required by rule 9, absent on all screens. Place above the footer and Fab, for example bottom 160 (above the Fab top at y684), left/right 16, and never covered by the FabMenu.
12. **Touch targets**: all drawn controls are at least 44px. Edge targets: Fab 60, Search 52, footer tabs 48, ok. The SlotMeter is non-interactive. Do not make its 8px pills tappable.
13. **Left-edge gesture**: none drawn. The Editor Back button at left:8 is a tap only, so keep swipe-back disabled. Strips start at x16.
14. **Contrast**: amber #d97706 13px/600 on white is about 3.2:1 (below 4.5). Check. Red #dc2626 is about 4.8, ok. ink-3 #9aa3b2 only on ring strokes, fine as non-text.
15. **Editor and tasks background**: Editor uses #ffffff page while other screens use bg. TaskSheet is rgba(255,255,255,.94), the only sheet with a higher opacity than GLASS .72.
16. **Gestures with visible alternates**: none drawn (no swipe). If swipe actions are added, the TaskSheet is the alternate.
17. **Filter label**: ContextAvatar aria-label says it "opens menu with Activity and Settings" but F2-Menu is the Fab menu. Missing screen.

## 5. Dark mode (mockups are light only)

Dark tokens: bg #0d0f16, surface #181b26, surface-2 #21252f, line #262b38, ink #e8eaf2, ink-2 #9aa3b4, ink-3 #616c7e, accent #818cf8, accent-ink #a3adff, office #818cf8, personal #34d399.

| Light value | Where | Dark |
|---|---|---|
| #f3f3f7 | bg, fade stop | bg |
| #ffffff | cards, rows, selected segment, avatar disc, Editor page, menu pills | surface (Editor page: bg or surface, decide) |
| #eceef4 | tiles, notes input, progress track, filing chip | surface-2 |
| #e7e9f0 | dividers, hairlines | line |
| #d9dce4 (line-2) | chip outlines, empty Goal, grabber, outlined cards | line-2 dark #353c4b (tokens.css) |
| #1c2230 | text, icons, home indicator | ink |
| #586273 | secondary text | ink-2 |
| #9aa3b2 | checkbox rings | ink-3 (check 3:1 on surface) |
| #4f46e5 | Fab, meter fill, commit, active toggle, office dot | accent #818cf8. White icon on it is low contrast, use bg-dark ink icon |
| #4038c4 | active tab, links, accent text | accent-ink |
| #059669 | personal dot and text | personal |
| #d97706, #dc2626 | ageing, overdue text | age-aging-ink dark #fbbf24, age-stale-ink dark #f87171 (tokens.css) |
| #e2e4ec, #e9e8fc | meter empty, Task menu pill | surface-2 and accent at about .16 over surface |

Glass and alpha values needing a dark equivalent:
- GLASS fill rgba(255,255,255,.72) becomes rgba(24,27,38,.72). The sheet's .94 becomes rgba(24,27,38,.94).
- Hairline rgba(217,220,228,.8) becomes rgba(38,43,56,.8).
- accent-soft rgba(79,70,229,.10) becomes rgba(129,140,248,.16). accent-line .32 becomes about rgba(129,140,248,.40).
- Personal soft rgba(5,150,105,.10) becomes rgba(52,211,153,.14).
- ink@6 rgba(28,34,48,.06) becomes rgba(232,234,242,.08).
- Fade gradient uses rgba(243,243,247,0/.9) and becomes rgba(13,15,22,0/.9).
- Scrim rgba(20,18,15,.28) needs a stronger value (about .55) in dark.
- Shadows rgba(40,40,90,x) and the Fab glow rgba(79,70,229,.55) should become black-based (or a toned accent glow) and be reduced.
- Keyboard colours are mock only.
