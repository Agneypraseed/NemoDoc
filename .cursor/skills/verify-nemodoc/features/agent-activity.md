# Agent activity

## Sub-features

Animated work scenes with pause/reduced-motion support; roster and current work; notebook tool steps; per-agent activity; actionable counts; text and status filters; empty matches; small-screen layout; live refresh and disconnected states.

## How to get to it (user POV)

Open a notebook and choose `Agent`. The default Agents view displays the overview. Agent cards expose `View activity` and `Agent settings`; the summary counts jump to filtered activity.

## Driving it with Playwright

Run `npm run verify:agents -- agent-overview.spec.ts`. It checks the sample PDF loads, opens `Agent`, and finds the `Agent overview` region. The fixture supplies Study partner, Research scout and Coordinator. Expand `View 1 recent tool step`. Choose `View Research scout activity`, then `All agents ×`. Choose `Show working sessions`: the activity heading receives focus and only working entries remain. Fill `Search activity` with an absent value, check the no-match message, then `Clear filters`. Select `waiting` in `Activity status`, then search for `research`. The `Runtime agent activity` list must include Compare research papers and exclude Morning revision. Clear filters, inspect 390px layout, and exercise completed/offline refresh. The fixture asserts no inference and only read commands. It verifies the working scene has running animations, pauses via `Agent animations`, disables motion through the reduced-motion preference, and checks completion stops the animation. `output/agent-working.png` captures the working card; the verification results retain a browser video.

## Gotchas

Counts are sessions, not agents. Unknown status is not idle. Runtime unavailable and zero matching results are different states. Polling is five seconds and cached server reads can add delay; use observable assertions. Native runtime status is injected; containment and real model calls remain unverified.
