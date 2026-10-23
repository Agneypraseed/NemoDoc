# Autonomous agent tools

Personal tasks use a bounded Nemotron function-calling loop with `tool_choice: "auto"`. The model selects tools and their order; the application validates and executes each request and returns its actual result. Tools are advertised only when the task permits them. Forged calls to unadvertised tools are also rejected on the server.

```mermaid
flowchart LR
  A[Request and task permissions] --> B[Nemotron chooses a tool]
  B --> C[Validate arguments and scope]
  C -->|allowed| D[Persist audit entry]
  D --> E[Execute tool]
  E --> F[Return result and record outcome]
  F --> B
  C -->|rejected| F
  B --> G[Cited answer and downloadable files]
```

## Create a task

1. Configure and test a Nemotron connection. For web work, save and test a provider in **Settings → Search**.
2. Open **Agent → Research → Scheduled tasks & activity inbox → New task** and choose **Research and write a file**.
3. Select approved notebook sources, upload/select text files, or allow web research. A task needs at least one of these evidence sources. Uploading creates a local copy; selecting it grants the task read access.
4. Enable **Allow public web search and page reading** and **Allow new output files…** when needed. Give a concrete request such as “Read my brief, search official documentation, and write a cited Markdown summary.”
5. Inspect the cited excerpts, action outcomes and **Created files**. The download contains the actual generated file. **Run history and trace inspection** provides the detailed audit and redacted JSON export.

## Tool authority

| Tools                                          | Enforced scope                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_sources`, `read_passage`               | Only the task’s approved notebook source IDs and available pages.                                                                                                         |
| `list_files`, `read_file`                      | Only selected file IDs and files created in this run, in the same notebook.                                                                                               |
| `search_web`, `read_web`                       | Task opt-in and the saved, tested search connection revision. Read URLs must come from this run’s search results. Only successfully extracted pages receive citation IDs. |
| `write_file`                                   | Task opt-in; new files in the notebook’s dedicated agent workspace. Retrieved citation IDs are required; inline references must match them.                               |
| Study materials, plan, memory and review tools | Existing notebook scope and task-specific memory/scheduling permissions.                                                                                                  |

Files support `.md`, `.txt`, `.csv` and `.json`, up to 64 KiB each, 20 selected inputs per task, and 100 files/2 MiB per notebook. Filenames cannot contain directories, traversal components, control characters or reserved device names. Physical paths use generated IDs under `data/agent.json.files/` (or the configured agent data filename plus `.files`). Symlinks/junctions, hard-linked files, non-regular files and oversized reads are rejected. Writes create new IDs exclusively, even for the same display name. There is no arbitrary host-path, shell or executable-file tool.

Runs retain the limits of eight model calls, twenty tool actions and three minutes. Source revocation, cancellation and model changes stop subsequent actions; changed search settings require a new task. Output metadata survives restart and interrupted actions are not replayed. **Erase all agent data** removes registered sandbox copies and generated files with the agent history; notebook originals remain in browser storage. Redacted traces are stored separately and retained by this control.

## Audit and privacy

Markdown writes require each declared supporting citation ID to appear inline. JSON outputs must parse as JSON; their numeric arrays remain data and their provenance is retained in file metadata.

Tool requests record their call ID, validation/rejection decision, result/error and timing. An allowed decision must reach PostgreSQL or the local JSONL spool before execution; both destinations failing blocks the action. Successful, rejected and failed outcomes appear in the activity inbox. Traces redact configured credentials and private model reasoning. They can contain approved text; inspect exports before sharing.

Web queries go to the search provider. Retrieved file/page text, task context and accumulated tool results go to the model. Files and pages are untrusted text and cannot grant new tools or host paths. These controls enforce application permissions; they do not guarantee correct model claims or eliminate malicious instructions within granted authority. NemoDoc remains a single-user local application, not a multi-user authentication service or an operating-system sandbox.

## Reproduce verification

`npm run verify` runs static, unit/API and production-build checks. `npm run verify:agents -- autonomous-tools.spec.ts` owns an isolated local server and browser. It exercises the real upload/task/worker/download UI with deterministic provider boundaries: file/web tools, a rejected traversal write, input preservation, audit events, download bytes, reload persistence and mobile overflow. Fixtures do not prove provider availability or model quality.

For a paid live run, explicitly set `NEMODOC_AUTONOMOUS_LIVE=1` and run the same browser command. It reads only the saved model configuration (or `.env` Nemotron defaults) and `TAVILY_API_KEY` from ignored `data/autonomous-live.env`. Keep keys out of commands and Git. Setup saves/tests Tavily in a separate verification workspace. The input is a public synthetic brief; the ordinary worker chooses real tool calls, with no mocked model responses or tool results. Evidence stays under `output/autonomous-live-*` and `output/verification/`.

The README screenshot is captured from the live UI. Security tests separately cover denied tools, out-of-scope IDs, invalid arguments, traversal, links, citation integrity, changed search settings and unavailable audit storage. A screenshot or live sample does not prove general factual accuracy or NemoClaw containment.

## Live record — 2026-10-23

The final isolated browser run used `nvidia/Nemotron-3_5-Lightning` through Nebius Token Factory and real Tavily search/extraction. Nemotron chose `read_file`, `search_web`, `read_web` and `write_file`; all four actions succeeded. Five inference responses returned HTTP 200 with matching model IDs. Four Tavily requests covered connection search/extraction and the task's search/extraction. The run persisted 64 trace events, and the browser verified the downloaded Markdown bytes, declared inline citations, original-input preservation, reload persistence and mobile layout.

The completed UI is in `docs/screenshots/autonomous-tools-live.png`. The separate security screenshot uses deterministic provider responses and shows a rejected traversal filename; it is not presented as a live model refusal. Local receipts, traces, video and generated output are retained in ignored `output/autonomous-live-OYSN46/`; the browser report is in `output/verification/report/index.html`. These checks establish this workflow sample and reference integrity, not general model accuracy.
