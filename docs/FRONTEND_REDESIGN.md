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

This is an active redesign, not a completed visual verification report.

- [ ] Desktop reading and contextual answer layout verified in browser.
- [ ] Selection toolbar, passage markers, follow-ups and whole-notebook chat.
- [ ] Notes/search, Studio and Agent use consistent visual hierarchy.
- [ ] Library, settings, empty/loading/error states.
- [ ] Quick/Deep chooser and keyboard/focus behavior.
- [ ] Light/dark themes and small-screen/book/compare layouts.
- [ ] Reduced motion, contrast and overflow checks.
- [ ] Regression browser tests, TypeScript and production build.
- [ ] Compare generated primary-screen concept with rendered screenshots.

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
titles and quiet row separators. Mobile workspace still hides the notebook
title; addressing that remains part of responsive verification.
