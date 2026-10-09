# Cited page verification

Verified in the prepared cloud checkout on 2026-10-09 using Node 22+ and system
Chromium through `/workspace/.nemodoc-onboarding/playwright.config.ts`.

- `npm run check`: pass.
- `npm test`: 32 tests pass.
- `npm run build`: pass (existing dependency annotation warnings only).
- Browser suite excluding opt-in live inference: 17 tests passed; the OCR test
  initially expected the old `p. 1` label. After updating that assertion to the
  implemented `Page 1` label, its targeted rerun passed.
- All three new browser feature flows pass: original three-page PDF with text
  verification of the isolated download, real three-slide PPTX with PNG signature
  verification, and deterministic topic answers with page deduplication.
- PDF previews survive reload and ZIP restore. PPTX previews survive reload.
- Explicit PDF selection/render/export generated no chat or vision API requests.
- Mobile PDF and desktop slide screenshots were inspected. Preview height is
  bounded; the bottom composer remains visible. Evidence/actions remain scrollable.
- Unit tests cover source ambiguity, invalid pages, unavailable sources, evidence
  mismatch, deduplication, backup references, and prevention of unrelated fallback.

The learning deck is original test content, generated with python-pptx. Complex
PPTX backgrounds/shapes/themes remain subject to the existing reconstructed
renderer fidelity limits. No live inference was run: no provider key is configured.

Delivered through [PR #1](https://github.com/Agneypraseed/NemoDoc/pull/1)
from `codex/cited-page-previews`.

## Pre-merge review on 2026-10-09

Numbered-page questions now call chat with only the requested page's text and
preserve the original page number; a simple request to return that page stays
local. PDF lecture pages also accept “slide” requests. Empty visual evidence is
not replaced with a fabricated quotation, and the PDF export library loads when
the download is requested.

The reviewed branch passed `npm run check`, all 33 unit/API tests,
`npm run build`, and the complete browser suite: 19 passed, with the two opt-in
live inference checks skipped. The new regression flow verifies numbered-page
Q&A and local PDF slide returns. These checks use deterministic AI responses;
the earlier real Nebius verification is recorded in `LIVE_VERIFICATION.md`.
