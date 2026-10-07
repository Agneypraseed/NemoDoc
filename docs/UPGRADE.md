# NemoDoc upgrade acceptance checklist

The requested scope is all ten additions from the feature discussion. Keep local notebook compatibility, make commits by subsystem, and push the finished work to origin/main.

- [x] Document thumbnails, outlines, bookmarks, and exact reading position / view restoration.
- [x] Underline, freehand pen, sticky notes, tags, filters, and undo/redo.
- [x] Annotated PDF export containing marks and Unicode comments.
- [x] Citations reveal the supporting excerpt on the source page.
- [x] NVIDIA semantic search with cached embeddings and optional reranking.
- [x] OCR for scans, retained selectable text, and visual questions about charts / tables.
- [x] Complete notebook ZIP backup and validated additive restore.
- [x] In-app server-side connection configuration, test, and hosted/local switching.
- [x] Editable, persistent flashcards, quizzes, study guides, and interactive mind maps with citations.
- [x] Side-by-side document reading and source-grounded comparison.
- [x] API/unit/browser tests, rendered UI review, and production build.
- [x] Changes committed locally by subsystem.
- [ ] Verified push to origin/main (pending explicit approval after automatic review rejection).

Existing API/model credentials are never included in backups or Git. Hosted inference requires a configured key; local endpoints remain supported. Use mocked provider responses for deterministic tests and clearly report live-provider verification limits.

## Verification evidence

Validated on October 8, 2026: `npm test` passed 17 checks; `npm run test:e2e` passed 11 browser flows; `npm run build` passed TypeScript checking and production bundling. `git diff --check` passed. The build reports harmless annotation warnings from Zod; the PDF worker and vendor bundles are split into separate assets.

| Requirement | Evidence |
| --- | --- |
| Navigation / resume | Real PDF thumbnail and bookmark actions; a PDF with an outline and mixed page dimensions resumes its within-page offset after reload. |
| Markup | Browser selection creates underline; sticky notes and pen drawings persist; tags filter results; undo and redo change the stored annotation list. |
| PDF export | Browser downloads a six-page annotated PDF; unit checks preserve rotated pages and native Unicode comments. |
| Precise citations | Semantic results open the correct source page and display evidence highlights over the rendered text. |
| Semantic retrieval | Mock NVIDIA vectors rank semantically related passages; repeated queries reuse passage embeddings; reranking payload and ordering are verified; chat reports keyword fallback on provider failure. |
| OCR / vision | A blank PDF acquires selectable, searchable OCR text that survives reload; visual requests include a real rendered page. PowerPoint image capture contains rendered text pixels. |
| Backup / restore | Original bytes, reading preferences, Unicode notes, conversation citations, and study citations survive remapping. Browser restores a separate notebook without replacing the original. Invalid manifests are rejected. |
| Settings | Hosted/local switching, key retention/removal, redacted responses, endpoint validation, persistence, and connection test are covered. |
| Study tools | All four kinds generate; cards flip, quiz answers score, guides and nodes edit, branches collapse/expand, materials persist after reload and enter complete backups. Provider output with invalid citations or map structure is rejected. |
| Comparison | Two readers navigate independently; comparison submits exactly the selected pair to chat. |
| Compatibility / UI | A version-1 IndexedDB library migrates without losing documents, notes, or highlights. Desktop reader, studio, citation, comparison, and desktop/mobile settings screenshots were inspected; mobile reader has no horizontal document overflow. |

Live NVIDIA inference was not exercised without user credentials. AI tests use deterministic provider mocks; the request contracts were checked against NVIDIA's official embedding, vision, and reranking documentation linked in the README. OCR coordinates are approximate; slide reconstruction retains the MVP fidelity limits.

## Delivery status

Automatic approval review rejected the attempted push because it treated the earlier instruction not to push as still active and the GitHub destination as unverified. No push was executed. The destination is `https://github.com/Agneypraseed/NemoDoc.git`; explicit approval is required before retrying. The final local changes and verification are complete.
