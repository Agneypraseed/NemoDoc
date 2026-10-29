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

## Active goal: integrated study workspace

- Owner: /root, single agent. Full goal remains active: word-level editing of generated content; flexible formats/organization; source management and location; notebook-wide structural graph; cohesive intuitive experience; personalized AI insights. Commit locally at each stage.
- Previous goal turn classification: progress (chat continuation was committed and fixture-verified). Initial audit for this objective is in `docs/PRODUCT_CAPABILITIES.md`; existing code is evidence of capabilities, not proof of the complete end state.
- Stage 1 implemented: Graph workspace view with notebook/source/note/study nodes, source-reference and containment edges, search/source filters, graph/table modes, selected-item details and local navigation. Use actual citations and reject stale, foreign-notebook, empty-page references. No new persistence schema is needed because the view derives from current saved records.
- Remaining stages: audit/complete editing and formats; verify source-management journeys; make personalized learning insights discoverable; verify all requirements end to end.
- Stage 1 verified: two graph-data unit tests pass; lint passes; production build/typecheck passes after correcting an initial layout-map typing error. Isolated `notebook-graph.spec.ts` passes after the responsive-layout refinement. It saves a cited answer through the UI, opens its original PDF page, switches Graph/Table, filters notes, reloads stored data, opens the saved note, and checks mobile overflow. Visual review confirms narrow panels show note nodes without horizontal scrolling. Evidence: `output/notebook-graph-verification.log`, `output/notebook-graph-desktop.png`, `output/notebook-graph-mobile.png`, and browser traces/report under `output/verification/`. No live provider calls.
- Next concrete stage: inspect `docs/SAVE_ANSWER_TO_NOTES.md` and the message/saved-answer renderers in `src/App.tsx`; add editable generated answers where missing, preserve citations and streaming metadata, and verify save/export/reload behavior. Then complete note display/organization and personalized-learning journeys. Keep the full goal active; do not mark complete from this graph milestone.

### Stage 2: editable generated answers

- Previous goal turn: progress, committed graph stage `81de541` with fixture browser evidence. Full goal remains active.
- Read `docs/SAVE_ANSWER_TO_NOTES.md`; follow its data/provenance/verification requirements. Its old PR-branch sentence is superseded by the user's current main/local stage-commit instructions; no PR is requested.
- Add the same word/Markdown editor to completed chat and saved-answer views. Track edits, preserve citation metadata and passage copies, protect edits from stale streaming snapshots, and add optional backup fields.
- Saved-note synchronization uses an exact unique saved block; separately edited notebook text is preserved with a visible notice. Older saved messages get an exact-match migration without rewriting unrelated notes.
- Stage 2 verified: all eight save-answer unit tests pass, including editable saved-note synchronization, unchanged citation metadata, separate-note preservation, passage-copy edits, stale-stream resistance, backup roundtrip and legacy snapshot fallback. Typecheck/build and lint pass. `answer-editing.spec.ts` and `notebook-graph.spec.ts` both pass with isolated fixtures: cancel with Escape, change words, render a table, edit saved answers, keep separate raw notes, export/reload, edit a generated Studio guide, and open that guide from Graph. Editing makes no extra inference request. Screenshots `output/answer-editing-desktop.png` and `output/answer-editing-mobile.png` were visually reviewed; logs `output/answer-editing-verification.log`.
- Integration: Graph now opens source files directly (including those without extractable citations) and opens a selected study item in Studio. Save/regenerate actions hide during editing to keep draft actions clear.
- Next concrete stage: personalized learning. Current Studio quiz results are scored in component state and can optionally be shared to agent memory/workspace, but there is no durable local quiz history or discoverable targeted-generation loop. Inspect `StudyStudio.tsx` scoring and `server/features.ts` study generation; implement locally persisted attempts and source-grounded targeted review, then verify quiz-to-insight-to-study behavior using deterministic fixtures. Afterwards perform a full requirement audit, including source removal, display formats and integrated persistence. The full goal remains active.

### Stage 3: personalized learning from local quiz history

- Previous goal turn: progress; editing milestone committed as `0d36db6`. Full goal remains active.
- Implement local quiz-attempt snapshots in notebook records and backwards-compatible backups. Derive review needs from the latest recorded answer per source-scoped question, so successful later practice replaces old misses. Do not infer mastery or invent progress.
- Add Your learning in Studio with local history, missed-question/source navigation, targeted-guide and targeted-quiz actions. Requests send at most 10 missed snapshots and retain selected-source/page scope. The model receives original passages as evidence; learner choices remain untrusted context. Explicit agent sharing remains separate.
- Stage 3 verified: three local progress/backup tests pass; all 11 feature API tests pass, including personal-review request scoping. Typecheck, lint and production build pass. `learning-progress.spec.ts` and `answer-editing.spec.ts` passed together; the final learning journey also passes after adding automatic scroll to newly generated material, with an in-viewport assertion. Fixture browser evidence covers local score history after reload, cited-page navigation, two missed-question snapshots sent to targeted guide/practice, later correct answers clearing earlier misses, zero automatic memory-sharing, and mobile overflow. Logs: `output/learning-api-verification.log`, `output/learning-ui-verification.log`, `output/learning-ui-final.log`. Screenshots `output/learning-progress-desktop.png` and `output/learning-progress-mobile.png` were visually reviewed. No live providers used.
- Next stage is the final capability/source audit. Current evidence supports editing, table/graph views and personalized review, but broader source management/content preservation and export provenance are not complete. Inspect `removeSource` in App (currently drops passage-note records/annotations; raw saved notes and conversation survive), and `exportArtifact` in StudyStudio (currently lists all retrieval citations rather than only cited evidence). Fix gaps, verify all four requested capabilities in an integrated journey including backup/restore and source removal, and produce a requirement-by-requirement audit before completing the goal. Keep the goal active.

### Stage 4: source lifecycle, provenance and full capability audit

- Previous goal turn was progress: local learning/review stage committed as `0da181a`. Full objective remains active pending requirement-by-requirement audit.
- Preserve source-linked passage and annotation text in notebook notes before source deletion, atomically with local deletion. Undo restores structured notes and removes only an unchanged archival block; separate edits are preserved. Cancel a running chat before removal to prevent late answers from reattaching an orphaned passage. Agent access still revokes explicitly.
- Filter study exports and rendered study/chat source links by actual citation use and existing notebook pages. Retain missing-reference labels and original content instead of presenting removed pages as evidence. Full available-source records are separate from selected inference inputs, so deselecting a source does not erase historical provenance.
- Stage 4 verified: source lifecycle/provenance unit checks pass; full `npm test` passes 213/213. Lint and production TypeScript/build checks pass. Five integrated fixture browser journeys passed (`product-workspace`, `answer-editing`, `notebook-graph`, `learning-progress`); the final two-case integration rerun also passed after adding direct quiz-word-edit/restore and removed-source chat-citation assertions. Logs: `output/product-unit-verification.log`, `output/product-capabilities-verification.log`, `output/product-integration-final.log`. All spawned test commands are terminal.
- Final rendered states `output/product-formats-final.png` and `output/product-source-final.png` were inspected; they show restored study formats/source-page navigation and preserved notes with zero original-source nodes after removal. Existing desktop/mobile edit, graph and learning screenshots were also inspected in their stages.
- Completion audit is `docs/PRODUCT_CAPABILITIES.md`, with every numbered capability and the integration/personalization requirements mapped to current code and direct tests. It concludes that implementation is complete; live model factual quality and a formal usability study are not claimed.
- The final audit additionally found manually written internal citation links could still look clickable without an available source. Chat, saved-answer and Studio renderers now label them unavailable. The new regression initially caught the saved-answer fallback, which was corrected; the final three browser cases all passed (`output/product-provenance-recheck.log`). Current production build/type checks also passed in that run.
- All required implementation and verification is complete. This source/provenance stage and the requirement-by-requirement audit are delivered in the final local stage commit. Confirm its clean-worktree state, then mark goal accounting complete. No push or live inference authorized/required.

## Follow-up: homepage notebook library entry

- Owner: /root. Add All notebooks at the top alongside Create a notebook.
- Change: secondary homepage link opens the existing library via `/app?library=1` after browser storage loads. Consume the launch parameter so closing/reloading does not reopen the modal. Keep the create action primary; wrap both controls on narrow screens.
- Verification: all three existing homepage/library browser journeys pass, including navigating from the homepage to three persisted notebooks and opening one on mobile. Production build/TypeScript and lint pass. Desktop/mobile screenshots were inspected: `output/home-notebooks-desktop.png`, `output/home-notebooks-mobile.png`. Log: `output/home-notebooks-verification.log`. No live inference used.

## Follow-up: browse before opening a notebook

- User clarified that All notebooks must show only the library, without opening the sample/last workspace. Empty libraries must offer creation and never seed the sample merely by browsing.
- Replace the modal-on-workspace link with a standalone `/notebooks` page that reads existing records without loading App, sources, models or demo initialization. Explicit row selection opens that notebook; shared creation dialog opens only a newly created notebook. Cancel remains on the library. Old `/app?library=1` links resolve to the standalone page before App mounts.
- Reuse search/sort/library controls; add a real empty state and creation action. Keep homepage creation available.
- Verification complete: TypeScript, lint and production build pass. Both homepage browser journeys passed; all three library journeys pass after correcting an initially ambiguous test submit selector. Coverage confirms saved list selection, empty-state creation, cancellation/reload without demo creation or API requests, and legacy/trailing-slash links. Desktop, mobile and empty-state screenshots were visually reviewed. Logs: `output/notebook-list-verification.log`, `output/notebook-list-recheck.log`. No live provider requests or user notebook data used.

## Follow-up: live long-chat verification

- Owner: /root. User explicitly requests a live provider call to verify long chat answers and the previous output-limit error. Inspect existing continuation handling, exercise real chat with isolated synthetic source data, and fix any demonstrated failures. Preserve personal browser notebooks and credentials; record only safe response evidence. Verification pending.
- Initial live Quick stress call reached `length`, then its continuation returned `stop` after completing only the interrupted paragraph (remaining requested sections and ending were missing). This demonstrated premature completion despite successful API statuses, not a layout truncation. Evidence: `output/long-chat-live-t6dwPm/summary.json` and initial browser trace. Strengthen continuation instructions to retain the full original task, finish every remaining section and requested ending. Focused four continuation tests pass after this change; live recheck pending. Initial sandboxed unit attempt was blocked by loopback EACCES; rerunning with permitted loopback passed.
- Live recheck passed against saved Nebius `nvidia/Nemotron-3_5-Lightning`: customized Quick (edited through Settings to force a long answer) sent 3,504 prompt characters and produced 9,022 rendered characters in 2 calls (`length`, then `stop`), about 9.4 seconds including UI checks. Default Deep sent 7,129 prompt characters and produced 18,531 rendered characters in one `stop` call, about 17.5 seconds. Both reached the requested ending, enabled Save to Notes, retained the exact submitted question, fitted mobile widths, and survived reload. Desktop/mobile final screenshots were visually inspected. Evidence and safe receipts: `output/long-chat-live-f7XTKy/summary.json`; successful log `output/long-chat-live-recheck.log`. Synthetic PDF and isolated backend/browser only; no personal notebook documents transmitted.
- Added explicitly opt-in live browser coverage to the verification harness and feature map. Current TypeScript/production build, lint, and all four focused continuation regression tests pass. The feature remains bounded to 8,000 question characters, three total provider segments and a 120-second deadline; these checks establish tested completion/rendering behavior, not unlimited output or factual-quality guarantees. No model policy, token cap or private notebook data changed.
