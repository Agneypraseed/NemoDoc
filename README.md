# NemoDoc

**A study notebook for PDFs and lecture slides.**

NemoDoc helps you read, annotate, and understand your course materials. Ask questions about a passage or your notebook, get answers grounded in source citations, and turn what you read into study aids.

![NemoDoc showing a source passage and cited answer](docs/screenshots/chat.png)

## What you can do

- Read and annotate PDFs and slides, including OCR for scanned pages.
- Ask questions about a selected passage or across a notebook, with citations back to the source.
- Save notes and answers, then create flashcards, quizzes, study guides, and mind maps.
- Use a personal agent for tasks based on sources you approve.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Reading and annotation work without AI credentials. NemoDoc uses NVIDIA Nemotron by default; configure a provider in Settings to enable live AI.

## Your files and AI

Your notebooks and source files stay on your device. When you use hosted AI, NemoDoc sends the relevant source text or selected page images to your configured provider. Export notes or back up and restore a notebook as a ZIP file.

For optional agent setup, see the [personal agent guide](docs/PERSONAL_AGENT.md) and [NemoClaw guide](docs/NEMOCLAW.md).

[MIT license](LICENSE)
