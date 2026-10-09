# Real Nemotron book verification

Verified on **2026-10-09** against the full **417-page** local copy of [Mathematics for Machine Learning](https://mml-book.github.io/) by Marc Peter Deisenroth, A. Aldo Faisal and Cheng Soon Ong. The source book and exported pages remain local and are excluded from Git. Screenshots credit the original book; application licensing does not cover book content.

## Actual inference

The successful browser run made two real HTTP requests to `https://api.tokenfactory.nebius.com/v1/chat/completions`, using `nvidia/Nemotron-3_5-Lightning`. Both provider responses returned HTTP 200, a response ID and the same Nemotron model ID. [Sanitized receipts and exact prompts](MML_VERIFICATION.json) record this run without credentials or full source excerpts.

The test's browser API proxy forwards the actual response from an isolated local server that uses real `fetch` to reach Nebius. It supplies no fabricated provider replies, answers, citations, source files, previews or downloads. User notebooks and personal-agent state are untouched.

## Case 1: explain a book topic

The question asks about **principal component analysis (PCA), dimensionality reduction and variance maximization**. The real answer explains the topic using book excerpts and citations. Clicking the first citation navigated to PDF page **323**, the opening of Chapter 10 (printed page 317).

![Real Nemotron PCA answer and original cited page](screenshots/mml-answer.png)

The live run exposed a citation-format variation: Nemotron can write `[2, p.323]`. The app now accepts page-qualified and grouped citation IDs only when they agree with retrieved references. Unknown IDs and mismatched page numbers remain unlinked; they cannot create a supporting preview. Unit and browser regressions cover this behavior.

## Case 2: request and download supporting pages

The second prompt requests just the supporting PCA pages for downloading. The model selected PDF pages **323** and **328** in the final run. The app rendered the original local pages with PDF.js and exported each as a single-page PDF using pdf-lib. Expand **Supporting excerpts** to inspect the source text; **Open in reader** follows the original page reference.

![Original book pages returned in chat with PDF download controls](screenshots/mml-supporting-pages.png)

For both downloads, verification confirmed:

- Exactly one page in the PDF.
- PDF.js text exactly matches the corresponding original book page.
- Independent pypdf extraction also matches exactly.
- Poppler renders match the original pages pixel for pixel, including figures, equations, page numbering and copyright footer.
- Clicking Download made no extra inference request.
- Supporting previews regenerate after browser reload.

The app labels **PDF page positions**. Printed book numbers differ because of cover and front-matter pages. Relevant page choices may vary between model responses; the app validates references against the imported source rather than hardcoding this example.

## Nemotron-only configuration

The live account catalog listed Nemotron Lightning, Nano, Super and Ultra. All inference paths reject other model families. Nebius embedding, vision and reranking IDs start blank; keyword retrieval handles this demo without another model. Optional capabilities need a compatible Nemotron model offered by the configured provider. Existing non-Nemotron capability settings are retired while preserving the saved provider and key.

## Repeat locally

Put the book at `data/mml-book.pdf` and configure `NEBIUS_API_KEY` in ignored `.env`. Then run:

```powershell
$env:NEMODOC_MML_LIVE='1'
npx playwright test tests/e2e/mml-live.spec.ts
Remove-Item Env:NEMODOC_MML_LIVE
```

Use `NEMODOC_MML_BOOK` for another local path. Real calls consume Nebius inference credits. Output screenshots, receipts and individual page downloads land in ignored `test-results/`, which subsequent browser tests may replace. The committed screenshots and receipts above preserve the final verified run.

## Final checks

- TypeScript check and production build passed.
- All 36 unit/API/data tests passed.
- All 19 browser scenarios passed: the renamed model-picker check was corrected and rerun; the other 18 passed in the full suite.
- The opt-in real MML/Nemotron workflow passed separately; normal browser runs skip live inference.
