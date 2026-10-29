# Worklog

## Goal

Add separate editable Quick and Deep conversation system prompts in Settings, persist them for this browser, and send the selected prompt with each chat request. **Complete.**

## Current instructions

- Owner: `/root` (single-agent; do not delegate unless the user asks).
- Work in `D:\Me\NemoDoc`; preserve browser notebook data and existing workflows.
- Keep source excerpts, citation provenance, and required grounding behavior attached to chat requests.
- Run focused checks for changes per the updated developer instructions; use isolated fixtures for agent verification.
- Make a coherent local commit after validation per AGENTS.md; do not push. Keep private data out of Git. Isolated verification may write ignored fixture artifacts under `output/`.

## Decisions

- Store Quick and Deep prompt text as a user preference in browser storage, separate from notebook content.
- Keep retrieved excerpts dynamic per request and preserve application-level source/citation requirements when composing the effective system message.
- Add a dedicated Conversation section in Settings with a focused editor for each mode and a reset-to-default action.
- Send the selected prompt to both notebook chat and image questions; keep image evidence rules appended by the server.

## Status

- Added separate Quick and Deep prompt editors under Settings > Conversation, with automatic browser-local saving, character counts, and per-mode reset-to-default controls.
- Added shared defaults and request-size limits; selected prompts now reach notebook chat, passage-note chat, and image questions. Server-added source citation and image evidence safeguards remain in effect.
- Formatted the changed source files with Prettier and ran `git diff --check` successfully.
- Tests, typecheck, build, and browser verification were not run because the user did not ask to test or verify the implementation.

## Follow-up: Notebook actions menu layering

- Goal: diagnose the menu overlap shown in the browser screenshot and prevent reader toolbar controls from painting over it.
- Cause: the header's glass backdrop creates a stacking context; the menu's local `z-index` cannot outrank later reader content, so toolbar icons can show through/overlap when the menu extends below the header.
- Change: raise the header stacking order while the notebook actions popover is open.
- Verification: source inspection only; no tests or browser verification run.

## Follow-up: Agent activity placement

- Goal: keep the task activity list in the Dashboard, as requested.
- Change: removed the duplicate activity heading, run-history picker, and empty state from Assistant. Opening a personal-agent run from Dashboard still opens its detailed result in Assistant; scheduled tasks remain in Assistant.
- Verification: `git diff --check` passed; no tests or browser verification run.

## Current goal: simplify research and expose instructions

- Owner: /root. Complete. No remaining implementation work.
- Make Research the default Agent entry, with Dashboard for activity. Preserve tasks/schedules and revision/synthesis as secondary tools under More.
- Remove task-type selection from the primary research journey. Expose planner, researcher and reviewer instructions, plus required evidence rules. Persist editable defaults in browser storage; store the selected instruction snapshot with the queued run.
- Keep per-agent assignment/instruction edits and model selection, source approval, citations and previous runs.
- Use the verify-nemodoc skill for isolated browser evidence; run focused API tests and type/build checks.
- Research is the default entry with editable Planner / Researcher / Reviewer instructions, browser-local defaults, visible fixed evidence rules, and per-agent instruction/assignment cards. Generated plans choose 1–4 researchers plus one reviewer within the existing run budget. New researchers inherit the generic researcher instructions rather than another agent's custom edits.
- Validation: 20 research API tests pass; typecheck, lint and production build pass. Both research browser journeys passed, including model routing, saved reports and Dashboard inspection; the final single research journey also passed after prompt-display refinements and mobile editor coverage. These use deterministic providers, not live inference.
- Evidence: `output/agent-research-instructions.png`, `output/agent-research-instructions-mobile.png`, `output/agent-research-plan.png`, `output/research-flow-final-verification.log`; verification report/traces in `output/verification/`.
- Final navigation browser journey passed: default Research, no primary task-type selector, Tasks & schedules and Study tools reachable through More, Dashboard status filters, and zero inference on navigation. Log: `output/agent-navigation-verification.log`. Production build includes the final prompt editors and shared prompt contract. No live model calls or deliveries were made.

## Follow-up: label research sources

- Goal: rename the first Research step to “Sources” per the browser comment.
- Change: the step is now “1 · Sources,” and the page intro says “Choose sources.” Added a browser assertion for the visible step title.
- Validation: `npm run check` and `npm run lint` passed. The `verify:agents` production build passed, but its browser runner remained silent after startup warnings; the run was interrupted without a test result. No live model calls were made.

## Current goal: one configurable agent flow (complete)

- Owner: /root. Replace competing research and Assistant composers with one Research form using the existing dynamic delegation engine. Default to automatic delegation; keep one-agent execution available. New immediate and scheduled jobs use the same API and runtime.
- Source selection/approval stays inline. Save editable role defaults in browser storage; expose required system instructions and selected skill. Tasks & schedules lists saved jobs and links back to scheduling in Research. Dashboard owns activity.
- Preserve earlier planned research reports and trace inspection through Dashboard. Remove the separate study-form entry; reusable study skills live in the unified composer. The older planned engine remains compatible with existing records.
- Validation: typecheck, lint and production build passed. All 13 delegation API tests passed in the host runtime (the sandbox blocks two fixture-file renames). Five report/persistence tests passed, including automatic-team notes, cited evidence filtering, deduplication, and preservation of edited notes/messages. All three isolated browser journeys passed: source approval plus future scheduling/pause/resume, dynamic notebook/web delegation with persisted traces and mobile checks, and unified navigation with zero inference. Final focused browser coverage also passed: save automatic research to Notes and retain the saved marker after reload. One standalone attempt stopped during search-fixture setup before UI execution; retry passed without a product-code change. Logs: `output/unified-agent-report-save.log` and `output/unified-agent-report-save-retry.log`. Logs: `output/unified-agent-verification-final.log`; screenshots: `output/unified-agent-desktop.png`, `output/unified-agent-mobile.png`, `output/unified-agent-schedules.png`. No live model calls or deliveries were made.

- Final UI review: desktop/mobile composer and saved-job list fit their panels. Existing notebook notes, messages, source files and historical reports are retained. All new work uses the same personal-agent task runtime, with dynamic delegation enabled by default; saved-job actions use the existing scheduler. No remaining implementation work. Local commit required; no push authorized.

## Follow-up: remove Agent reduced-motion control

- Goal: remove the Agent menu toggle at the user's request because it has no useful purpose in that menu.
- Change: removed the toggle, browser preference, and custom data-attribute CSS. Device-level `prefers-reduced-motion` support remains.
- Validation: source search and `git diff --check`; no tests run for this small reversible UI removal.

## Follow-up: continue truncated chat answers

- Owner: /root. User reported chat answers stopping mid-formula with the output-limit error.
- Change: when a provider reports a length limit, continue the same streamed answer with the existing source excerpts and partial output, up to two continuation calls. Preserve partial output and show an error if continuation fails or remains incomplete. Quick/Deep prompts and per-call limits stay unchanged.
- Verification: 13 focused API tests passed, including continuation using the same evidence and partial answer, preservation of partial output when the provider rate-limits a continuation, reasoning tags split across continuation requests, and at most three total provider calls. Typecheck and lint passed. Fixture providers were used; no live model request was made. Continuations are extra provider requests and may increase usage.
