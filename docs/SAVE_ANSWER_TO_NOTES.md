# Save answer to Notes

Turn a useful chat answer into a lasting notebook note with one click.

## User experience

- Show an accessible **Save to Notes** action on completed assistant answers.
- Append the associated user question and answer to the current notebook's Notes, preserving existing notes and Markdown formatting.
- Include only sources actually cited in the answer, with their names and page or slide numbers. Deduplicate repeated source/page references.
- Confirm **Saved** and prevent saving the same message twice, including after reload or backup restore.
- Save locally without another inference request. Match the existing design.

## Acceptance checks

- A saved answer preserves existing notes and includes its question, answer, and actual cited sources.
- Empty and unfinished streaming answers cannot be saved. An earlier completed answer can be saved while a new answer streams without losing note edits or save state.
- Uncited retrieval candidates, unknown citation IDs, and incorrect page-qualified citations are excluded; supported grouped and page-qualified citation formats still work.
- Notes and duplicate-prevention state survive reload and library backup/restore. Older backups remain compatible, and saved content appears in Markdown note exports.
- Run TypeScript checks, relevant unit and browser tests, and the production build. Use deterministic fixtures rather than a real API key for this feature's tests.

## Existing code to reuse

- `src/App.tsx`: chat rendering, notebook updates, and Markdown note export.
- `src/lib/citations.ts`: citation normalization and `usesCitation`.
- `src/types.ts`: notebook and message types.
- `src/lib/backup.ts`: validated library backup/restore.

Implement on this pull request's branch and leave the pull request unmerged for review.
