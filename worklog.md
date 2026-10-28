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
