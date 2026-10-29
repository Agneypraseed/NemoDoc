# NemoDoc

**A study notebook for PDFs and lecture slides.**

NemoDoc helps you read, annotate, and understand your course materials. Ask questions about a passage or your notebook, get answers grounded in source citations, and turn what you read into study aids.

## What you can do

- Read and annotate PDFs and slides, including OCR for scanned pages.
- Ask questions about a selected passage or across a notebook, with citations back to the source.
- Save notes and answers, then create flashcards, quizzes, study guides, and mind maps.
- Use a personal agent for tasks based on sources you approve.

## PCA research demo

Watch a live `nvidia/Nemotron-3_5-Lightning` run delegate two source-reading assignments, check PCA claims against a synthetic PDF, and save a cited answer to Notes. The activation data is synthetic and is not from a trained Vision Transformer.

<video controls preload="metadata" width="100%" title="Live NVIDIA Nemotron PCA research demo">
  <source src="docs/demo/nemodoc-agent-flow.mp4" type="video/mp4" />
</video>

[Watch the 38-second live Nemotron PCA research demo](docs/demo/nemodoc-agent-flow.mp4)

For tool permissions and audit details, see [tool permissions, limits and verification](docs/AUTONOMOUS_TOOLS.md).

## Research teams

Review the lead's plan before starting. The lead delegates one to four researchers plus a reviewer as needed, checks their findings against source excerpts, and writes a cited report. Edit each role’s instructions and models before launch; optionally enable Tavily, Exa, or Firecrawl search in **Settings → Search**.

## Work traces

Follow each agent’s assignment, model, stage, usage, and findings. **Run history and trace inspection** shows model calls, supplied excerpts, tool inputs and results, citations, timing, and errors. Traces save to local JSONL or PostgreSQL and can be downloaded as redacted JSON. They may include your request and approved source text; inspect before sharing.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Open the notebook at [http://127.0.0.1:5173/app](http://127.0.0.1:5173/app). Reading and annotation work without AI credentials. NemoDoc uses NVIDIA Nemotron by default; configure a provider in Settings to enable live AI.

## Your files and AI

Your notebooks and source files stay on your device. When you use hosted AI, NemoDoc sends the relevant source text or selected page images to your configured provider. Export notes or back up and restore a notebook as a ZIP file.

For agent setup, see the [personal agent guide](docs/PERSONAL_AGENT.md) and [model connections](docs/AGENT_CONNECTIONS.md).

Agent execution uses the [OpenAI Agents SDK for TypeScript](https://openai.github.io/openai-agents-js/). SDK agents run research planning, parallel researchers, final review, evidence proposals and personal/scheduled tasks. Existing OpenAI-compatible model profiles support separate providers per agent; using NVIDIA, Gemini's compatibility endpoint or a local model does not require an OpenAI inference key. See [agent architecture](docs/AGENT_ARCHITECTURE.md) for the runner, model adapter, tool permissions, Markdown instructions and provider limitations.

[MIT license](LICENSE)
