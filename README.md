# NemoDoc

A local, document-centered notebook powered by NVIDIA Nemotron. Read PDFs and slides, select text, keep annotations on the page, and ask questions grounded in your sources.

## Run locally

Requires Node.js 22 or newer.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. A sample notebook is included. Reading, markup, exports, and backups work without a model connection. Open **Settings**, enter your NVIDIA API key, then choose **Save & test**. The `.env` file remains an optional starting configuration.

For a production build: `npm run build`, then `npm start` and open http://127.0.0.1:3001.

## NVIDIA integration

The server calls NVIDIA's compatible chat completions API. Default models are `nvidia/nemotron-3-nano-30b-a3b` for chat and study generation, `nvidia/llama-nemotron-embed-1b-v2` for embeddings, and `nvidia/nemotron-nano-12b-v2-vl` for visual questions and OCR. Optional reranking uses `nvidia/rerank-qa-mistral-4b`.

Settings supports separate chat, embedding, vision, and reranking endpoints. **NVIDIA hosted** fills the hosted URLs; **Local NIM** fills loopback examples on ports 8000–8003. Start those NIM services separately and set their actual URLs and model IDs. Loopback HTTP endpoints can run without a key. All other endpoints require HTTPS and a key. Connection settings are saved to ignored `data/settings.json` on the local server; the browser never receives the saved API key. The connection test verifies chat. Embedding, vision, and reranking errors are reported when those features run.

**Search ideas** uses semantic retrieval across selected sources. Enabling semantic retrieval in Settings also applies it to chat and study tools. Passage embeddings are cached in server memory by content, model, endpoint, and credential identity; restarting clears this cache. Chat falls back to keyword retrieval with a visible notice when embedding or reranking requests fail. OCR uses a vision transcription prompt and validates the returned text and layout.

References: [Nemotron chat](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-30b-a3b), [embedding request modes](https://docs.api.nvidia.com/nim/reference/nvidia-llama-nemotron-embed-1b-v2-infer), [vision image inputs](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-nano-12b-v2-vl-infer), [reranking](https://docs.api.nvidia.com/nim/reference/nvidia-nv-rerankqa-mistral-4b-v3-infer), [local NIM API](https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html).

## Notebook workspace

- Local notebooks and PDF / PowerPoint (.pptx) sources.
- Selectable text, colored highlights, underlines, freehand pen, sticky notes, and area marks. Notes support tags, filtering, and undo/redo (Ctrl/Cmd+Z and Shift+Z outside text fields).
- Vertical, horizontal, and two-page book layouts; zoom, thumbnails, PDF outlines, bookmarks, and saved reading position. Bookmarks and view preferences are stored with each source.
- Source-grounded NVIDIA chat. Citation clicks open the source page and highlight the supporting excerpt when it matches the rendered text.
- Search inside a document or search selected sources by meaning; optional reranking.
- **OCR** recognizes the current page, retains a selectable text layer, and makes the transcription searchable and usable in chat. **Ask image** attaches a rendered PDF page or reconstructed slide for questions about diagrams, charts, and tables.
- **Studio** generates flashcards, multiple-choice quizzes, Markdown study guides, and interactive mind maps. Flip cards, check quiz answers, explore and collapse map branches, edit generated content, and export materials. Materials and their citations persist locally.
- **Compare sources** opens two independent readers. **Compare ideas** sends exactly that pair to grounded chat.
- Export notes as Markdown, download originals, and export annotated PDFs with visible marks and native Unicode comments. PPTX markup is retained in backups; export a deck to PDF before using annotated PDF export.
- **Backup** downloads a complete notebook ZIP: original files, annotations, OCR, reading preferences, notes, conversations, and study materials. **Restore** validates the archive, remaps IDs, and adds a new notebook with a `(restored)` suffix. Existing notebooks stay intact. Backups never include credentials.
- Documents and notebook data persist in the browser's IndexedDB. Existing MVP libraries migrate automatically.

PowerPoint import reconstructs text boxes and embedded raster images; complex themes, native charts, SmartArt, video, and animations are not reproduced. Export slides to PDF for exact visual fidelity and visual analysis of those elements. OCR layout is approximate and model-generated; dense pages or unclear scans can need correction outside the app. Citations identify retrieved evidence, and generated answers still need review against the source.

The app runs locally. Hosted search sends selected source text and queries to the embedding/reranking APIs; chat and study generation send retrieved excerpts; OCR and visual questions send the selected page image. Choose local NIM services for local inference. Browser storage is origin-specific: development and production URLs have separate libraries. Use a backup to move between them or before clearing site data. Imports allow 50 MB and 500 pages per source. AI requests allow up to 30 selected sources. Restore allows a 250 MB archive, up to 50 MB per original file and 500 MB of expanded originals.

## Checks

`npm run check`, `npm test`, `npm run build`, and `npm run test:e2e`.

Install the browser for end-to-end checks once with `npx playwright install chromium`. API tests mock NVIDIA responses; browser tests use real document rendering with deterministic AI responses. See [the upgrade acceptance audit](docs/UPGRADE.md). A live model response requires your own key or running local NIM; no live provider result is claimed by the mock tests.

PDF workers, character maps, fonts, and image decoders are served locally. `npm install` prepares the generated PDF assets; rerun `npm run postinstall` if you remove `public/pdfjs`.

The repository remains a local app; connecting a GitHub remote does not publish documents or host the app.
