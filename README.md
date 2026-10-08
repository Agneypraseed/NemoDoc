# NemoDoc

A local personal research and study agent powered by NVIDIA Nemotron. Read and annotate PDFs and slides, keep editable memory, and run reusable study workflows with cited evidence on a schedule.

## Run locally

Requires Node.js 22 or newer.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. A sample notebook is included. Reading, markup, exports, and backups work without a model connection. Open **Settings**, choose **Nebius**, **NVIDIA hosted**, or **Local inference**, enter the provider key if required, then choose **Save & test**. The `.env` file remains an optional starting configuration; saved Settings take precedence. Changing `.env` requires restarting the server. Keep keys out of chat, screenshots, and commits.

For a production build: `npm run build`, then `npm start` and open http://127.0.0.1:3001.

The chat input stays at the bottom of the workspace while you read, annotate or use Studio. Close the assistant with its **X** and reopen the conversation using the chat icon beside Send; closing keeps the conversation and current draft. **Suggestions** opens the question cards when needed. Selecting a card fills the input for review before sending. Escape or clicking outside dismisses the cards. The **+** in the top toolbar creates a notebook.

## Personal agent

Open the **Agent** tab:

1. Add a goal and deadline, preferences, or weak topics under **Memory**. Memories are scoped to this notebook and can be edited or deleted.
2. Under **Sources**, select documents and explicitly approve caching their extracted text on your local server. The cache is a snapshot: reapprove sources after OCR or other text changes. Original PDFs/slides stay in browser storage.
3. Choose a reusable skill: **Review a paper**, **Weekly briefing**, **Quiz weak topics**, or **Prepare for an exam**. Edit these workflows or add your own under **Skills**.
4. Create a task with its own permitted sources. Run now, choose a future time, or repeat daily/weekly. Progress writes and one follow-up review are optional permissions. All tasks can update this notebook's study plan and save study materials.
5. Review results in the activity inbox. Page citations open the reader. Save generated practice or guides to **Studio**. After answering a Studio quiz, **Remember quiz result** records the score and missed questions for future agent runs.

The model selects tools in a real OpenAI-compatible function-calling loop. The local server dispatches only bounded tools: search approved text, read an approved page, save cited materials, update a plan, remember progress if allowed, and schedule one non-recursive review if allowed. The agent has no shell, arbitrary filesystem, email or external calendar tools. It uses keyword retrieval independently of the optional embedding setup. A run permits at most eight model calls, twenty actions and three minutes. Failures pause tasks; action history remains available when a run is cancelled. A task stays bound to the provider/model approved at creation; changing that connection requires a new task.

Keep `npm run dev` or `npm start` running for background tasks. Closing the browser does not stop the worker. Stopping the local server does. On restart an overdue recurring task runs once, then schedules its next interval from that run; it does not replay every missed interval. An interrupted run is marked as interrupted and never replayed automatically. Tasks are serial, so a later task waits for an earlier one. This MVP is a single-user local service, not a multi-user hosted deployment or an OS startup service.

Agent memory, skills, source snapshots, plans, task history and runtime receipts persist in ignored `data/agent.json`. **Agent → Sources → Export agent data** downloads this separate JSON archive; it can contain private source text and past context. Notebook ZIP backups cover browser data and do not include server agent state. To move the complete local agent installation, preserve `data/agent.json` separately alongside notebook ZIPs; the agent file refers to notebook/source IDs from its original browser library, so restored ZIPs with new IDs need source reapproval and new tasks. The separate JSON export is an archive, not an automatic restore importer. Never publish `data/`.

Revoking a source clears its cached text and pauses affected active tasks. Removing a source in the reader also revokes agent access; undo restores the browser document and requires reapproval for the agent. Past results and run disclosures retain their historical text. **Erase all agent data** removes that history, memories, tasks, plans, snapshots and receipts across all notebooks. It leaves browser notebooks intact. Files are local and ignored by Git, but are not encrypted at rest; use your OS account/disk protections. Hosted inference sends the task, skill, notebook memory/plan, source names and retrieved passages to the selected provider. Each run shows its sent context and actions. There is no automatic provider fallback.

## Nebius and free NVIDIA options

| Connection                               | Access and cost                                                                                                                                                          | Hackathon runtime                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Nebius Token Factory                     | Paid inference or limited promotional credits; the Builder Program currently offers eligible, verified members $25 in Token Factory credits, expiring after 90 days.     | A successful runtime call using an NVIDIA open model satisfies the runtime route described in the rules. |
| NVIDIA hosted                            | Free Developer Program API access for prototyping, subject to availability/rate limits and program terms. Production NIM use has separate licensing requirements.        | NVIDIA-hosted calls alone do not satisfy the Nebius runtime requirement.                                 |
| Local open model / NIM-compatible server | No hosted per-token fee for your own open-weight runtime. Hardware costs and model/runtime licenses still apply; NIM development access and production licensing differ. | Local inference alone does not satisfy the Nebius runtime requirement.                                   |

For Nebius, use `https://api.tokenfactory.nebius.com/v1` and a Token Factory key. **Save connection**, then **Load saved provider’s model catalog** to get exact account-visible IDs. The preset `nvidia/Nemotron-3_5-Lightning` follows the current official cookbook; select another NVIDIA Nemotron ID from the catalog if it is unavailable. The agent requires function calling. No model download or local inference runtime is bundled. Choose the actual served ID when connecting a local model.

The Nebius preset and environment defaults use `Qwen/Qwen3-Embedding-8B` for semantic search and `openbmb/MiniCPM-V-4_5` for image questions/OCR. NVIDIA Nemotron powers chat, study generation and the personal agent. All three models were available in the account-visible catalog during live verification. Semantic chat retrieval and reranking remain off by default; enable advanced capabilities only after checking their served model IDs. The current preset does not assume a Nebius reranking service is available.

The opt-in live suite sends an original, non-sensitive fixture to real Nebius endpoints and uses isolated notebook/agent state. It requires a `NEBIUS_API_KEY` in `.env` or the environment and consumes inference credits. In PowerShell, run `$env:NEMODOC_LIVE='1'` followed by `npx playwright test tests/e2e/live.spec.ts`; afterward remove the opt-in with `Remove-Item Env:NEMODOC_LIVE`. Sanitized evidence and a screenshot are written to ignored `test-results/`. Normal browser tests skip these live cases. See the [live verification record](docs/LIVE_VERIFICATION.md).

For local Nano inference, follow NVIDIA's [Nemotron 3 Nano model card and vLLM setup](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16#use-it-with-vllm), including its tool-call and reasoning parsers. Use **Local inference** and enter the server's exact served model name. A model name containing `nemotron` enables the documented `chat_template_kwargs.enable_thinking=false` option for local endpoints; configure other served aliases on the inference server to return final content within the app's output limit. The [model card's governing license](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16#licenseterms-of-use) is NVIDIA's Nemotron Open Model License, separate from this app's MIT license. This setup needs suitable GPU resources; free NVIDIA hosted prototyping avoids downloading/running the weights yourself.

The key stays on the server. Changing the chat host clears the previous provider key unless a replacement is supplied; a key is not forwarded to another provider's embedding/vision/reranking host. Advanced models must be available from the selected provider, with compatible capabilities. Keyword chat/agent retrieval works without embeddings; visual Q&A and OCR require an image-capable model. The connection test verifies chat only. A successful response creates a local timestamp/model/endpoint receipt, which is evidence of the call rather than a certification of hackathon eligibility. Model names alone do not verify the model's license or eligibility.

Sources: [Nebius quickstart](https://docs.tokenfactory.nebius.com/quickstart), [function calling](https://docs.tokenfactory.nebius.com/ai-models-inference/function-calling), [Nemotron cookbook](https://github.com/nebius/token-factory-cookbook/blob/main/models/nemotron/README.md), [NVIDIA free prototyping terms](https://docs.api.nvidia.com/nim/docs/product), [Nebius Builder credit terms](https://nebius.com/builders-terms-and-conditions). Free access and model availability can change; check these terms before relying on them.

## NVIDIA integration

The server calls NVIDIA's compatible chat completions API. Default models are `nvidia/nemotron-3-nano-30b-a3b` for chat and study generation, `nvidia/llama-nemotron-embed-1b-v2` for embeddings, and `nvidia/nemotron-nano-12b-v2-vl` for visual questions and OCR. Optional reranking uses `nvidia/rerank-qa-mistral-4b`.

Settings supports separate chat, embedding, vision, and reranking endpoints. **NVIDIA hosted** fills the hosted URLs; **Local inference** fills loopback examples. Start those services separately and set their actual URLs and model IDs. Loopback HTTP endpoints can run without a key. All other endpoints require HTTPS and a key. Connection settings are saved to ignored `data/settings.json` on the local server; the browser never receives the saved API key. The connection test verifies chat. Embedding, vision, and reranking errors are reported when those features run.

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

The repository remains a local app; connecting a GitHub remote does not publish documents or host the app. Application code is [MIT licensed](LICENSE); third-party dependencies and models keep their own licenses. See [Personal AI acceptance and demo notes](docs/PERSONAL_AGENT.md) for verification and submission steps.
