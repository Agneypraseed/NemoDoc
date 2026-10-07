# NemoDoc

A local, document-centered notebook powered by NVIDIA Nemotron. Read PDFs and slides, select text, keep annotations on the page, and ask questions grounded in your sources.

## Run locally

Requires Node.js 22 or newer.

```powershell
npm install
Copy-Item .env.example .env
# Set NVIDIA_API_KEY in .env for AI features.
npm run dev
```

Open http://127.0.0.1:5173. Reading and annotations work without an API key. A sample notebook is included.

For a production build: `npm run build`, then `npm start` and open http://127.0.0.1:3001.

## NVIDIA integration

The server calls the OpenAI-compatible chat completions endpoint at `https://integrate.api.nvidia.com/v1/chat/completions` with `nvidia/nemotron-3-nano-30b-a3b`. Credentials stay on the server. Configure `NVIDIA_BASE_URL` and `NVIDIA_MODEL` to use a local NVIDIA NIM deployment instead.

References: [Nemotron 3 Nano model](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-30b-a3b), [NVIDIA LLM API reference](https://docs.api.nvidia.com/nim/reference/llm-apis), [NIM API reference](https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html).

## MVP scope

- Local notebooks and PDF / PowerPoint (.pptx) sources.
- Selectable PDF text and on-page highlights with notes.
- Vertical, horizontal, and two-page book layouts; zoom and page navigation.
- Source-grounded NVIDIA chat with clickable page citations.
- Search inside sources and export notes as Markdown.
- Documents, notes, and conversations persist in the browser's IndexedDB.

PowerPoint import reconstructs text boxes and embedded images; complex themes, charts, SmartArt, video, and animations are not reproduced. Export slides to PDF for exact visual fidelity. Image-only PDFs can be read and annotated with area highlights, but this MVP does not include OCR.

The app runs locally. With the default hosted NVIDIA endpoint, selected source excerpts and conversation messages are sent to NVIDIA only when you ask an AI question. Choose a local NIM endpoint for local inference. Browser storage is origin-specific: the development and production URLs have separate libraries. Clearing browser site data removes the library; download originals and export notes before clearing it.

## Checks

`npm run check`, `npm test`, `npm run build`, and `npm run test:e2e`.

This repository is intended for local use and has no configured remote.
