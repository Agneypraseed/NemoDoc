# NemoDoc

**A study notebook for PDFs and lecture slides.**

NemoDoc helps you read, annotate, and understand your course materials. Ask questions about a passage or your notebook, get answers grounded in source citations, and turn what you read into study aids.

![NemoDoc showing a source passage and cited answer](docs/screenshots/chat.png)

## What you can do

- Read and annotate PDFs and slides, including OCR for scanned pages.
- Ask questions about a selected passage or across a notebook, with citations back to the source.
- Save notes and answers, then create flashcards, quizzes, study guides, and mind maps.
- Use a personal agent for tasks based on sources you approve.

## Research teams

Review a plan for three agents: two researchers work in parallel, then a reviewer checks their findings against source excerpts and writes a cited report. Edit each role’s instructions before starting. Use different tested models by role, and optionally enable Tavily, Exa, or Firecrawl search in **Settings → Search**.

## Work traces

Follow each agent’s assignment, model, stage, usage, and findings. **Run history and trace inspection** shows model calls, supplied excerpts, tool inputs and results, citations, timing, and errors. Traces save to local JSONL or PostgreSQL and can be downloaded as redacted JSON. They may include your request and approved source text; inspect before sharing. Connected NemoClaw agents can have reusable instructions in their own `AGENTS.md` files.

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
