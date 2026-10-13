# NemoDoc

**Your PDFs and lectures, turned into a notebook you can think with.**

NemoDoc is a local workspace for PDFs and lecture slides, powered by NVIDIA Nemotron by default. Read and annotate your sources, ask about a selected passage or your whole notebook, and keep useful, cited answers close at hand.

![NemoDoc's reader with a passage answer beside the source](docs/screenshots/chat.png)

## The NemoDoc MVP, in 30 seconds

[![Animated preview of NemoDoc's reading, notes, study, and agent workflows](docs/demo/nemodoc-mvp-tour.gif)](docs/demo/nemodoc-mvp-tour.mp4)

[Watch or download the full product tour (MP4)](docs/demo/nemodoc-mvp-tour.mp4)

The tour uses the included sample notebook with deterministic demo responses. No model credentials or email/WhatsApp delivery are used. Live answers and agent runs use the connections configured in the app.

## What the MVP includes

- **Read and annotate.** Bring PDFs or lecture slides into a notebook. Read in vertical, horizontal, or book layout; highlight, underline, add notes, draw, search, bookmark, and run OCR on scanned pages.
- **Ask in context or across a notebook.** Explain, define, or ask about a selected passage in its own panel. Use the separate bottom chat for broader questions. Follow citations to source pages and inspect supporting excerpts.
- **Keep your own notes.** Review saved answers, highlights, and notebook notes in Notes. Export those notes as Markdown, or back up and restore the full notebook as ZIP.
- **Study from your sources.** Build flashcards, quizzes, study guides, and mind maps in Studio.
- **Delegate with control.** Approve sources and notes for the personal agent, reuse skills and memory, schedule weekday tasks, and configure delivery through your existing SMTP mailbox or WhatsApp Business connection.

<details>
<summary><strong>Browse screenshots of the app</strong></summary>

### Reading, selection tools, and highlights

![PDF reader with layout, annotation, OCR, and page controls](docs/screenshots/reader.png)

![Selected-passage toolbar with Ask, Explain, Define, and highlight tools](docs/screenshots/selection-tools.png)

![Saved highlight linked to its page in Notes](docs/screenshots/highlights.png)

### Contextual answers, notebook chat, and export

![Passage-specific answer with a source citation](docs/screenshots/chat.png)

![Saved answer in the Answers section of Notes](docs/screenshots/notes.png)

![Markdown notes export and notebook backup menu](docs/screenshots/export-notes.png)

### Study and agent workflows

![Study Studio with a generated flashcard deck](docs/screenshots/studio.png)

![Personal agent reusable skills](docs/screenshots/agent-skills.png)

![Agent model and delivery connections](docs/screenshots/agent-connections.png)

![Separate open-model connection with a local Gemma 4 and Ollama preset](docs/screenshots/agent-open-model.png)

![SMTP email connection settings](docs/screenshots/agent-email-setup.png)

![WhatsApp Business connection settings](docs/screenshots/agent-whatsapp.png)

![Agent task scoped to an approved source](docs/screenshots/agent-task.png)

![Weekday scheduling and delivery controls for an agent task](docs/screenshots/agent-schedule.png)

</details>

## Try it locally

Install **Node.js 22.13 or newer**, then run:

```sh
npm ci
npm run dev
```

Open [localhost:5173](http://127.0.0.1:5173). Reading and annotation work without model credentials. To enable live AI, open **Settings → Nebius**, enter your **Nebius Token Factory API key**, and choose **Save & test**.

Notebooks stay on your device; hosted AI receives relevant text or selected page images. Export notes or back up notebooks as ZIP files.

### Open models and agent delivery

NemoDoc agents use the notebook's Nemotron connection by default, or a separate tool-capable open model such as Gemma through Ollama. Weekday schedules use a chosen local time and time zone. See the [agent connections setup guide](docs/AGENT_CONNECTIONS.md).

## More

[Personal agent guide](docs/PERSONAL_AGENT.md) · [Real book demo verification](docs/MML_VERIFICATION.md) · [MIT license](LICENSE)
