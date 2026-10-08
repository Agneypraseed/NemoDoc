# Cloud task: return supporting PDF pages and lecture slides in chat

## Requested outcome

Implement this feature in `Agneypraseed/NemoDoc`: a user can ask a question about a PDF or lecture deck and see which source lines or slides support the answer. When they ask to return the relevant page or slide, show that actual page or slide inside the chat answer, with a download containing only that page or slide. Keep the existing reading workspace and bottom chat composer.

Examples:

- “Explain spaced repetition and show the slide this comes from.” → a grounded answer, supporting excerpt, and the cited slide preview.
- “Return just the page that explains retrieval practice.” → the matching page preview, source name, page number, and a single-page download, with minimal surrounding prose.
- “Show slide 4 from this lecture.” → slide 4 from the selected source, rather than unrelated keyword matches. Ask which lecture when multiple selected decks make the request ambiguous.
- A normal factual question → a cited answer with an easy way to reveal its supporting pages.

## Current implementation

The latest prepared repository state has the screenshot README committed on `main` at `7a9bc62`. Inspect the current branch before working; preserve newer changes if present.

- React/TypeScript/Vite frontend, Express API, PDF.js reader, `pdf-lib`, IndexedDB persistence. Node.js 22 or newer.
- `server/retrieval.ts` splits extracted page text into overlapping chunks and ranks passages with stable source IDs and one-based page numbers. `server/semantic.ts` handles optional embedding retrieval.
- `server/app.ts` implements `/api/chat` as streamed source citations and Markdown deltas. The prompt requires citations only to supplied excerpts. The server receives extracted text, while original documents remain in the browser.
- `src/types.ts` defines `Source`, `Citation`, `Message`, and notebook data. A citation already includes its source ID/name, page, and excerpt.
- `src/App.tsx` renders chat Markdown and citation buttons. `showCitation` opens the source reader on that page and highlights matching evidence. Citation buttons currently provide reader navigation, without a page embedded in the answer.
- `src/components/Reader.tsx` renders PDFs and reconstructed PPTX slides, including selectable text and OCR layers. Reuse its rendering conventions where practical.
- `src/lib/documents.ts` contains PDF.js configuration and PPTX import. `src/lib/page-image.ts` provides slide image rendering. `src/lib/pdf-export.ts` and `src/lib/storage.ts` provide PDF/export and download patterns.
- `src/lib/backup.ts` validates and restores notebook archives. Preserve compatibility with older notebooks and backups if the message schema changes.
- Chat, Studio, and the personal agent use NVIDIA Nemotron through Nebius Token Factory. Optional embeddings and vision use separate provider models. Keep the existing provider settings.

## Implementation requirements

1. Show evidence clearly: quoted supporting text, source name, and “Page N” or “Slide N” as appropriate. Only attach pages backed by valid source/page references; do not trust invented IDs or arbitrary model-generated URLs. Preserve the existing citation navigation.
2. Render real source content in chat. PDF previews should use the original locally stored PDF. PPTX previews should use the existing reconstructed slide renderer and preserve the documented import fidelity limits. Do not substitute generated text for a page image.
3. For requests to return a page/slide, reveal the relevant previews automatically. Offer a deliberate “Show supporting pages” control for ordinary answers. Respect requests for minimal prose. Handle explicit page/slide numbers deterministically with source selection and page bounds validation; keep semantic/keyword retrieval for topic-based requests.
4. Deduplicate multiple excerpts from the same page while retaining their evidence. Avoid eagerly rendering every retrieved candidate: distinguish the passages supporting the final answer from candidates sent to the model. Bound the initial number of previews and let users reveal additional supported pages.
5. Add “Open in reader” and an isolated download for each preview. PDF extraction should copy only the selected original page into a new PDF using `pdf-lib`. For PPTX, a PNG or single-slide PDF is acceptable; label the output accurately. Do not download the whole document under a single-page label.
6. Keep originals and rendering local. Do not upload whole PDFs/decks solely to create previews. Persist references to attachments with the conversation if needed, rather than storing duplicate document blobs or enormous image data in each message. Preserve reload and ZIP backup/restore behavior.
7. Handle removed sources, missing files, invalid page numbers, scanned pages without OCR, rendering failures, cancellation, and ambiguous requests visibly. No fabricated evidence or unrelated page fallback presented as a match. Keep answer generation usable if one preview fails.
8. Match the existing rounded, quiet UI. Keep the bottom composer, closable assistant, and on-demand suggestion cards. Make cards readable on mobile; support accessible labels, keyboard interaction, and reduced motion. Release PDF render tasks, document handles, and object URLs when no longer needed.

Choose the smallest reliable API/UI design. Existing citations already provide most of the necessary evidence metadata; avoid a second independent model call merely to render a cited page. If introducing a page selection event or structured response, validate it against the actual selected source/page set and ensure older stored messages still render.

## Verification and delivery

Use original, non-sensitive fixtures. Add meaningful coverage for a multi-page PDF and a PPTX deck, topic-based and explicit page requests, multiple excerpts on one page, invalid or missing source references, reload, backup/restore, and a mobile preview. Verify that downloaded PDFs have exactly one page and the correct source content; inspect a slide export too. Check that rendering and export do not send document bytes to a provider.

Run `npm run check`, `npm test`, `npm run build`, and the appropriate Playwright flows. Install Chromium with `npx playwright install chromium` if needed. Regular tests use deterministic provider responses. Live Nebius tests are opt-in; only run them if the cloud environment has an authorized key configured, and report honestly whether inference was real or mocked. See `docs/LIVE_VERIFICATION.md` for the existing live suite.

Work on a `codex/` feature branch, make useful commits, and deliver the tested change for review in a pull request. Update the README with the implemented behavior and a sample screenshot if appropriate. Keep `.env`, API keys, browser libraries, `data/`, and private documents out of commits, prompts, logs, and screenshots. The local PC's `.env` and document library are not available in the cloud. Do not merge directly into `main` as part of this task.
