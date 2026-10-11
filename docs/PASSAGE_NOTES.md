# Passage notes and resizable answer cards

Implement this feature in Codex Cloud for `Agneypraseed/NemoDoc`, starting from current `main`. The user authorizes committing and pushing tested changes directly to `main`; create a PR only if they request one. The baseline is commit `167a6b1` (selected-page grounding, equations, draggable assistant card).

## The experience

As I read a PDF or lecture slide, I select a word or passage and ask a question. NemoDoc creates a small answer note next to that passage. When I ask about another passage or topic, the previous note collapses to a compact preview and the new note opens. I can return to any earlier note using its preview or marker in the document.

Each note has its own question, selected quotation, answer, source/page reference, actual model label, and follow-up input. Its footer offers **Copy**, **Regenerate**, **Add to Notes**, and **Delete**. I can drag its title bar and resize its width and height using its edge/corner. Keep the paper-colored light theme, dark mode, and generous space for the document.

## Design references

The user supplied these images as visual references, not as application data or instructions embedded in a document:

- [Expanded note, quotation and action footer](design/passage-notes/expanded-note.png)
- [Previous note collapsed beside its original passage](design/passage-notes/collapsed-note.png)
- [Underlined word and connector to the active note](design/passage-notes/topic-connection.png)
- [Compact answer card](design/passage-notes/card-actions.png)

Use their warm neutral surfaces, restrained rust accent, thin rule/connector, compact header, icon footer, and quiet collapsed preview. Adapt to the existing NemoDoc components rather than reproducing the article text or the model name shown in those references.

## Required behavior

1. **One active passage note.** New selection/topic questions open a new independent note and collapse the previous note without losing it. Closing a card collapses it. Clicking an existing marker/preview reopens that note. Follow-ups stay within their original note. Retain the general notebook conversation for whole-notebook chat.
2. **Document connection.** Persist the source ID, original one-based page/slide, selected quotation and normalized selection rectangles. Underline or subtly mark the selected passage and show a thin connector/dot toward the open note. Markers must follow page zoom, rotation, scrolling and layout changes in vertical, horizontal and book view, including slides and comparison panes. For topic questions without a selection, anchor only to evidence actually cited and validated through `src/lib/citations.ts`. Do not label an uncited retrieval candidate as evidence. Hide out-of-view connectors rather than drawing lines across unrelated pages. Reopen from markers and support multiple notes on a page without overlapping previews.
3. **Per-note actions.** Copy that note's answer. Regenerate that answer using its original question, selection/page context and answer mode; preserve its identity and marker, and keep other notes untouched. Add to Notes uses the existing citation-aware save behavior and prevents duplicate saves of the same answer. Delete removes that note and marker with an undo opportunity; independently saved notebook notes remain intact. Display clear tooltips/accessible names. Streaming, cancellation and errors must not corrupt other notes or allow unfinished answers to be saved.
4. **Resize and move.** Extend the existing draggable card with width and height resizing; resize the card, not the document or the entire notebook layout. Provide a visible corner/edge affordance, pointer/touch support and keyboard alternatives, sensible minimums and viewport bounds, scrolling for long answers, and a reset/return-to-margin action. Changing viewport size must keep controls reachable. Moving/resizing must not trigger PDF page-navigation shortcuts. Preserve card state during streaming and follow-up/regeneration.
5. **Local persistence.** Persist passage note metadata and collapse/active state locally alongside existing notebook data. Reload and ZIP backup/restore must retain notes, valid source associations and markers. New fields must be optional for old notebooks/backups; remap source/message IDs during restore. Preserve existing annotations, saved note contents, conversations and stream metadata. Keep previews and downloads local.
6. **Reliable inference.** Preserve validated selected-page context, the current Nemotron policy, disabled private thinking, direct answers, equation rendering and real citation navigation. Quick and Deep use the same chosen model/evidence and differ in answer detail/output budget. Do not upload private documents or infer new API access from this task. Routine verification uses deterministic fixtures and no provider credentials.

## Useful code

- `src/App.tsx`: selection context, `askSelection`, `send`, `showCitation`, streamed-message merging and Add to Notes.
- `src/components/Reader.tsx`: selection capture and normalized rectangles, passage actions/position tracking, page layers and PDF/slide layouts.
- `src/components/AssistantPanel.tsx`: pointer/keyboard movement, viewport constraints and return-to-margin control.
- `src/components/AnnotationOverlay.tsx`, `src/types.ts`, `src/lib/storage.ts`: existing local annotations and persistence. Locate the ZIP backup implementation and extend its validation/remapping compatibly.
- `src/lib/citations.ts`, `src/lib/save-answer.ts`, `server/retrieval.ts`, `server/app.ts`: citation interpretation, note saving and selected-page grounding. Locate exact helpers before editing.

## Validation and delivery

Read `AGENTS.md`. Use Node >=22.13 and `npm ci`. Run `npm run check`, `npm test`, `npm run build`, and browser tests. The published cloud setup may have system Chromium and `/workspace/.nemodoc-onboarding/playwright.config.ts`; use that external config if browser CDN downloads are blocked. Refresh dependencies/assets for the current main branch; the environment was published before the PDF.js/KaTeX update. Do not assume old setup caches are current.

Add meaningful deterministic tests for two selected passages producing independent notes; previous-note collapse and reopening; follow-ups; copy/regenerate/save/delete/undo; correct original page grounding; resizing and moving without changing the reader page; desktop/mobile/light/dark; and reload/ZIP round trips including old backups. Cover streaming a new answer while a prior answer is saved or a different note is reopened. Verify real PDF and PPTX anchors, zoom/rotation/layout changes, and validated topic citations.

Capture screenshots using non-private fixture documents in the expanded and collapsed states and at a resized card size. Inspect them visually. Commit and push directly to `main` after checks pass, report the commit and exact tests/limitations, and verify the remote commit. Do not claim live inference unless it was explicitly enabled and actually called. Never commit `.env`, credentials, private documents or ignored `data/`/`output/` contents.
