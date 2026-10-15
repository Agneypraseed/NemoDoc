# Reading interface redesign

## Direction

Reference: https://www.usegloss.io/ and https://github.com/Nutlope/gloss.
Inspected the live landing page and Huxley reader on 2026-10-15.
Use its editorial hierarchy, restrained chrome, contextual interaction and
margin-answer relationship as inspiration. Keep NemoDoc's PDF fidelity,
local notebooks, provider policy and approval workflows.

The application already uses React 19 with Vite. Keep that architecture:
the requested visual and interaction improvements do not require server
rendering or migration of browser-owned documents to Next.js.

## Visual specification

- Light canvas #f7f6f2, white surfaces, charcoal #242321 text,
  #494743 secondary text and fine #e3e0d9 dividers.
- Preserve the existing charcoal dark palette and accessible theme setting.
- Compact sans-serif controls; editorial serif headings where appropriate.
  Original PDF typography remains untouched.
- 56px workspace header, 208px collapsible source rail, flexible document
  region and a stable complementary answer panel on wide screens.
- Small, consistently aligned outline icons. Quiet hover/selected states,
  visible keyboard focus, reduced-motion support.
- Separate whole-notebook conversation and passage conversation. Keep
  Chat, Notes, Studio and Agent navigation and actual data/actions.
- Composer has a text row and secondary control row. Quick/Deep belongs
  in a compact chooser; retain voice, source context and model identity.
- No new decorative dashboards, invented statistics or promotional copy.

## Completion gates

Verification covers the real application and isolated deterministic fixtures.
Generated concept content is never used as live notebook data.

- [x] Desktop reading and contextual answer layout verified in browser.
- [x] Selection toolbar, passage markers, follow-ups and whole-notebook chat.
- [x] Notes/search, Studio and Agent use consistent visual hierarchy.
- [x] Library, settings, empty/loading/error states.
- [x] Quick/Deep chooser and keyboard/focus behavior.
- [x] Light/dark themes and small-screen/book/compare layouts.
- [x] Reduced motion, contrast and overflow checks.
- [x] Regression browser tests, TypeScript and production build.
- [x] Compare generated primary-screen concept with rendered screenshots.

The generated concept is a layout reference; document/answer contents in it
are illustrative, never app data or verified model output. Necessary
differences: retain all existing actions and do not add generated suggestions
or model-selection controls without real behavior.

## Library and supporting panels checkpoint

The library is now a separate React component with a searchable list, title/newest
sorting, current-notebook indication, source counts and notebook creation.
The generated library reference uses sample notebook content; the implementation
always renders real persisted records. Its book motif uses the existing Lucide
icon set rather than introducing decorative raster assets.

Notes answer text and Agent fields are larger; Studio creation controls and
primary actions now use the shared accent and flat surfaces. The nine existing
Notes/Studio/workspace regression scenarios passed. The new library browser
scenario passed search, sorting, empty results, clearing, mobile overflow,
switching and reload persistence. TypeScript passed.

Visual review of desktop/mobile library captures caught a CSS specificity
collision with old card rules; scoped library selectors now preserve the serif
titles and quiet row separators. The responsive pass now keeps the notebook
title visible, with labeled workspace tabs on a second row.

## Visual review and intentional adaptations

Inspected the generated reading and library concepts with `view_image` alongside
browser-rendered captures. The live IAB reference and initial NemoDoc screen
were inspected first. Later, the IAB stale error tab was blocked by browser
policy; verification continued through the repository's isolated Playwright
suite, without bypassing that tab's restriction.

| Comparison | Implementation and verification |
| --- | --- |
| Palette | Warm neutral light canvas, white panels, terracotta primary controls; preserved charcoal dark theme. Muted light text darkened to #706c66 for contrast. |
| Typography | Serif panel/library headings with readable sans-serif controls. Saved answer body increased to 14px/1.8; actual PDF typography is preserved. |
| Reader/panel proportions | Reading remains dominant. All docked support panels fit above the composer; corrected Studio overlap. Book/compare layouts retain independent reading surfaces. |
| Composer | Text row plus controls row, native keyboard-accessible Quick/Deep chooser, existing voice and source tools. Kept the previously requested message icon for Send. |
| Library | Searchable, sortable list replaces repeated blank covers. Real source counts and current state; empty-result recovery and reload persistence tested. |
| Responsive behavior | Notebook title plus utility row and labeled view tabs at mobile widths; panel bounds and keyboard chooser tested from 320px to 1536px. |
| Settings | Sticky title/close controls remain reachable when long connection forms scroll. |
| Motion | Existing hover/focus/disclosure feedback retained; global reduced-motion rules disable animations, transitions and active-button transforms. |

The concept guides hierarchy and visual language rather than replacing the
product with a screenshot. Necessary adaptations are the existing NemoDoc logo,
source rail, page controls, conversation history, model attribution, and real
document contents. The mockup's example answer, invented follow-up suggestions,
extra notebook names and model chooser are not fabricated in the application.
The library uses the existing outline book icon instead of a new raster cover.

Above-the-fold copy remains the existing product navigation and real notebook
content, plus functional library labels (search, sort, count and Current).
Removed Studio's decorative eyebrow; corrected singular source count. No
marketing claims or demo statistics were added.

Evidence lives in generated `test-results/` screenshots and ignored
`output/design/` concepts. Representative captures include `reading-light.png`,
`reading-dark.png`, `reading-mobile.png`, `design-notes-1440.png`,
`design-studio-1536.png`, `design-agent-390.png`, `library-desktop.png`,
`library-mobile.png`, and `design-settings-mobile.png`.

## Final verification

The final full Playwright run passed 38 tests; four explicitly opt-in live
provider tests were skipped. This includes passage conversations, notes,
Studio generation/editing, source comparison, reading-position persistence,
legacy notebook migration, and both evidence-agent approval workflows.
The responsive navigation test checks all four panels at 320, 390, 700, 960,
1440 and 1536 pixels, keyboard Quick/Deep selection, reduced-motion rendering,
and the long settings dialog's reachable close control.

`npm run build` passed TypeScript and the production build. Vite still reports
its existing large-chunk advisory; this is not a failed build. No live model
accuracy or delivery claim is inferred from deterministic browser fixtures.
Final rendered desktop Studio, mobile reader and cited passage-answer captures
were inspected after the full regression run.
