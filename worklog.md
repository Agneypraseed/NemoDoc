# Worklog

## Goal

Add separate editable Quick and Deep conversation system prompts in Settings, persist them for this browser, and send the selected prompt with each chat request. **Complete.**

## Current instructions

- Owner: `/root` (single-agent; do not delegate unless the user asks).
- Work in `D:\Me\NemoDoc`; preserve browser notebook data and existing workflows.
- Keep source excerpts, citation provenance, and required grounding behavior attached to chat requests.
- Do not run or add tests unless the user asks to test or verify the implementation.
- Do not commit, push, or modify ignored `data/` and `output/` content.

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
