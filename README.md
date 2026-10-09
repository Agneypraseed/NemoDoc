# NemoDoc

A local personal research and study agent powered by NVIDIA Nemotron through Nebius Token Factory. Bring your PDFs and slides, read and annotate them, ask questions with page citations, and turn what you learn into a study plan that remembers your progress.

![NemoDoc reader showing a two-page book layout](docs/screenshots/reader.png)

## What works today

- **Read your sources:** import PDFs and PowerPoint files, switch between vertical, horizontal, and two-page book views, and use zoom, thumbnails, bookmarks, and document search.
- **Annotate as you read:** select text to highlight or underline it, add notes, draw with the pen, and organize annotations with tags and undo/redo.
- **Ask with evidence:** chat about selected sources or passages, follow citations back to the page, and request supporting pages with individual PDF downloads. Text retrieval works locally; semantic search and vision/OCR require compatible Nemotron models on your chosen provider.
- **Build study materials:** generate and edit flashcards, quizzes, study guides, and interactive mind maps in Studio. Check quiz answers and save missed questions as progress memory.
- **Use a personal agent:** keep editable goals, deadlines, preferences, and learning progress. Run reusable skills now or on a daily/weekly schedule using sources you approve.
- **Keep your work:** compare two sources side by side, export Markdown notes and annotated PDFs, and back up or restore complete notebooks as ZIP files.

## How to use it

1. **Create a notebook and add sources.** Use the **+** in the top toolbar and **Add source**. The included sample notebook lets you explore immediately.
2. **Read, select, and annotate.** Choose a reading layout, mark passages, and collect your thoughts in **Notes**.
3. **Ask from the bottom chat bar.** Send a question or select **Suggestions** to open the prompt cards. A card fills your draft for review before sending. Close the assistant with **X** and reopen it with the chat icon; your conversation and draft stay available.
4. **Practice in Studio.** Create a quiz or flashcard deck from selected sources. After a quiz, choose **Remember quiz result** to help the agent focus on missed topics.
5. **Set up your agent.** In **Agent → Memory**, add your goal and preferences. In **Sources**, approve extracted text for the local worker. Choose a skill—paper review, weekly briefing, weak-topic practice, or exam preparation—and create a task. Review its cited results and save its materials to Studio.

## A look inside

### Source-grounded chat

The composer stays at the bottom of the workspace. Suggested questions appear when requested, and answer citations open the supporting source page.

**Case 1 — explain a topic.** Import [Mathematics for Machine Learning](https://mml-book.github.io/) and ask about principal component analysis, dimensionality reduction and variance maximization. Nemotron answers from retrieved passages; clicking a citation opens the original book page.

![Real Nebius Nemotron answer about PCA with the cited MML book page open](docs/screenshots/mml-answer.png)

**Case 2 — return the source pages.** Ask “Return just the supporting pages about principal component analysis so I can download them.” The answer includes locally rendered pages with **Open in reader** and **Download single page (PDF)**. Expand **Supporting excerpts** to inspect the exact evidence. Each download contains one original page and needs no additional model call.

![Real Nemotron response with original MML book pages and individual PDF download controls](docs/screenshots/mml-supporting-pages.png)

These two screenshots use actual Nemotron responses through Nebius, with no mocked inference. The [MML verification record](docs/MML_VERIFICATION.md) includes provider receipts, page checks and the command to repeat the workflow. The book is by Marc Peter Deisenroth, A. Aldo Faisal and Cheng Soon Ong, published by Cambridge University Press; it retains its own copyright and is not included in this repository.

### Study Studio

Keep generated materials beside your reading. Flip flashcards, answer quizzes, explore mind maps, and edit or export the results.

![Studio with study tools and a sample flashcard deck](docs/screenshots/studio.png)

### Your personal agent

Reusable skills work with notebook memory and approved sources. Scheduled tasks continue with the browser closed while the local server is running; results arrive in the activity inbox.

![Personal agent showing reusable research and study skills](docs/screenshots/personal-agent.png)

The reader, Studio and agent overview screenshots use the included sample notebook; Studio content uses deterministic demo responses. The two MML chat screenshots above show real inference.

## Run locally

Requires **Node.js 22 or newer**.

```sh
npm install
npm run dev
```

Open [localhost:5173](http://127.0.0.1:5173). Reading, annotations, exports, and backups work before connecting a model.

For AI features, open **Settings**, select **Nebius**, enter a **Nebius Token Factory API key**, and choose **Save & test**. Use an NVIDIA Nemotron model available in your provider's model catalog. The verified configuration uses:

| Capability                                 | Nemotron-only configuration                                             |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Chat, study generation, and personal agent | `nvidia/Nemotron-3_5-Lightning` on Nebius                               |
| Source retrieval and page exports          | Local keyword retrieval, PDF.js and pdf-lib; no extra model             |
| Optional embeddings, vision/OCR, reranking | Configure only a compatible Nemotron model offered by the same provider |

The MVP restricts inference and the model picker to Nemotron models. Nebius optional capability IDs start blank because the checked account catalog offers Nemotron text models, with no compatible embedding or vision model listed. Older Qwen, MiniCPM and Mistral capability settings are cleared in memory while preserving your saved provider and key. Search falls back to local keywords when no embedding model is configured.

Get started with the [Nebius Token Factory quickstart](https://docs.tokenfactory.nebius.com/quickstart). The app also supports NVIDIA-hosted and local compatible inference endpoints through Settings. Optional embedding and vision features require compatible models; keyword retrieval works without embeddings.

Alternatively, copy `.env.example` to `.env`, set `NEBIUS_API_KEY`, and restart the server. Saved Settings take precedence over environment defaults. Credentials stay on the local server and are excluded from Git.

For a production build:

```sh
npm run build
npm start
```

Then open [localhost:3001](http://127.0.0.1:3001). Keep the server running for scheduled agent tasks.

## Storage and current limits

Original documents, annotations, conversations, and Studio materials live in your browser's IndexedDB. Agent memory, approved text snapshots, schedules, and run history live in ignored `data/agent.json`. Hosted AI requests send the relevant text, context, or selected page image to your chosen provider.

Notebook ZIP backups cover browser data; export agent data separately from **Agent → Sources**. Browser libraries are specific to their URL, so use a backup when moving between development and production. This MVP runs as a single-user local app.

PowerPoint import reconstructs text and embedded images. Export complex decks to PDF for faithful charts and layouts. OCR and generated answers can need review against the original source.

## Development and verification

Built with React, TypeScript, Vite, Express, PDF.js, and local IndexedDB storage.

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Regular tests use deterministic AI responses. The [earlier live verification record](docs/LIVE_VERIFICATION.md) documents document Q&A, study generation and agent execution, plus optional non-Nemotron capabilities tested before the model restriction. The current live suite keeps inference on Nemotron and uses keyword retrieval.

More detail: [personal agent guide](docs/PERSONAL_AGENT.md) · [workspace acceptance checks](docs/UPGRADE.md).

Application code is [MIT licensed](LICENSE). Models and dependencies retain their own licenses.

### Supporting pages in chat

Ask “Return just page 2 from Learning.pdf” or “Show slide 4 from Lecture.pptx”
to receive that page in the answer. Explicit numbers are resolved locally against
selected sources; select one source or include its filename when several are
selected. Out-of-range and unavailable sources produce a visible error.

“Explain page 2” still answers your question, using that page's text and showing
its supporting preview. Lectures exported as PDFs also accept requests such as
“Show slide 2 from Lecture.pdf”.

For topic questions, NemoDoc retrieves excerpts and explains them with citations.
“Show the page about retrieval practice” reveals supporting previews automatically;
ordinary answers offer **Show supporting pages**. Only citations used in the answer
are shown, grouped by source and page with all supporting excerpts. Two previews
are shown initially, with a control to reveal more. Evidence is checked against the
stored source text; mismatched references are withheld.

PDF previews render the original local PDF with PDF.js. **Download single page
(PDF)** copies only that original page. PowerPoint previews reuse the reconstructed
slide renderer and export only the chosen slide as **PNG**; the existing PPTX import
fidelity limits still apply (export the lecture to PDF for faithful complex layouts).
**Open in reader** retains citation navigation and highlighting. Scanned pages can
be returned by number without OCR, but need recognized text for topic evidence.

Conversation backups persist page references, not duplicate rendered images.
Reload and ZIP restore regenerate previews from the original local sources.
Rendering and page export never upload original document bytes to the AI provider.
