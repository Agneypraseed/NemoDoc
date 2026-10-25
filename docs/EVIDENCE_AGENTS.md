# Evidence-based notebook agents

NemoDoc's **Agent → Research** opens on **Research team**, with **Plan revision** and **Synthesize research** also available. Research teams use tested model profiles or your existing notebook/custom connection. Each agent has a separate conversation, assignment, tool budget, progress record and findings.

## Research team

Opening **Agent** starts on research. Local activity remains under **More → Agents**. Saved runs open with the new-request form collapsed, so the report is easy to revisit. Model review is still an AI draft: validate important claims against the cited original pages.

1. Approve the selected extracted-text snapshots, choose **Research team**, and enter your research request.
2. **Research models** links to the model connections used by the team. There is no automatic route fallback.
3. Select notebook evidence. To include the web, choose Tavily, Exa or Firecrawl under **Settings → Search** and select **Save & test search**, then enable web research for this run. Search queries may contain information from selected evidence and are sent to the selected search provider. Notebook-only runs require at least one selected source; web-enabled runs may omit notebook sources.
4. **Generate team plan** proposes two complementary researchers and one reviewer for your topic. The configured planner can assign different tested models by task using declared capability, strength and cost hints. Configure these in **Connections → Research models & task routing**; the current agent connection remains available by default. Edit names, assignments and model choices, add/remove researchers (2–5 agents total, exactly one reviewer), and review the assignments. A request, evidence, or connection change requires a new plan. The run retains each selected model and its selection reason; changing a selected profile stops subsequent requests without a model fallback. See [model setup](AGENT_CONNECTIONS.md#research-models-and-automatic-task-routing).
5. **Start research team** runs up to three researchers concurrently. Once every researcher completes, the reviewer compares their findings against original excerpts and writes the final cited report. Each researcher has five model calls/eight tool actions; the reviewer has four calls/six actions. Research has a ten-minute deadline. Each agent may make at most three web searches and extract five pages within its tool budget.
6. Inspect each agent's assignment, model, progress and findings. **Model & usage** holds detailed model choices and usage; **Run history and trace inspection** holds diagnostics. Plans and inference responses are traced, with planning traces linked to approved runs. With PostgreSQL configured, inspect the database-backed timeline and download the complete redacted activity log. Without PostgreSQL, the UI identifies local JSONL trace storage. Web search candidates have no citation IDs: only extracted page content can support a web citation. Citation validity does not prove factual support.
7. **Cancel research** stops active inference and queued work while retaining completed findings. Failure of any researcher prevents a successful synthesis. Restarted active runs are interrupted and never automatically replay inference. Start a new run to try again.
8. **Save report to Notes** explicitly appends a completed report and cited original excerpts to this local notebook. It preserves existing notes, prevents duplicate saves, and retains save state through reload and ZIP backup/restore. **Download report** exports Markdown, including retained partial findings on failed runs. **Use request again** opens the request and evidence for a new plan; it makes no inference call until you generate and review that plan. Scheduled tasks remain under **Scheduled tasks & activity inbox**.

Research execution is read-only. Saving the result to Notes is a separate explicit action; research never applies proposals, sends mail or executes code. Search provider credentials stay in the server data directory, are masked in the UI and redacted from traces. Existing historical runs remain readable. Browser ZIP backups retain their existing format; server workspace/run persistence is separate.

## Editable agent instructions

In **Review team assignments**, each researcher and reviewer has its own **AGENTS.md instructions** editor. Import a `.md` file, edit or preview its Markdown, and download it for editing in your preferred editor or reuse in another plan. **Task assignment** describes this request; `AGENTS.md` describes the agent's approach, output format and limits. Files allow up to 32,000 characters. Starting the team saves an immutable copy with that run, available from each saved agent card. Imports change only the draft; they make no inference calls. Regenerating a plan replaces the draft, so download instructions you want to reuse first.

Task-specific Markdown is sent only to its assigned agent, subject to NemoDoc's system instructions, citation requirements and enforced read-only tools. The planner cannot supply instruction files. Old runs without Markdown continue to work.

See [agent architecture](AGENT_ARCHITECTURE.md) for the OpenAI Agents SDK execution model, provider support and extension points.

## Try both workflows

1. Save notes locally. In Agent choose documents and notes, then explicitly approve storing their extracted-text snapshots on this server. No original PDF/slide file is uploaded by this operation.
2. Choose Plan revision or Synthesize research; research teams follow the flow above. Select approved evidence, edit the request, and optionally permit access to shared quiz progress. Choose **Create proposal**.
3. Expand **Run history and trace inspection**. Inspect prompts, supplied excerpts, request/response metadata, tool arguments/results, citations, spans, failures and interruptions. Events arrive incrementally while a run is active. Export a redacted JSON trace. Citation buttons open the local page. Unknown historical dates, missing token usage and missing model IDs remain unknown.
4. Edit individual actions. Save edits, which creates a new revision; then select actions and approve. Unselected actions are not applied. Rejecting applies nothing. Refreshing/revoking evidence invalidates pending proposals.
5. Import approved materials into Studio. Stable IDs make repeated imports update the same local artifact. Review tasks execute server-side while the server is running; an overdue task starts after restart. Its result is another proposal requiring approval.
6. To share immutable quiz attempts, check answers in Studio, then use **Remember quiz result** with an approved workspace. The complete question, choices, chosen answer, correct answer, original citations and time are snapshotted. Later quiz edits cannot rewrite them. Without an approved workspace the previous textual progress-memory behavior remains available.

The proposal templates return different typed reports. **Plan revision** links each focus to selected note IDs, any recorded quiz-attempt IDs, and cited source pages; quiz history is labeled not shared, no attempts, or recorded. **Synthesize research** requires two or more selected sources and includes one evidence-table row for every selected source, followed by cross-source comparisons and explicit unsupported claims. A comparison labeled supports, qualifies, or conflicts must cite at least two distinct selected sources. Research teams use the separate read-only flow above.

For optional email, configure SMTP in Connections and explicitly ask for an email in your workflow request. The proposal shows the fixed recipient, subject, exact body and evidence footer. Select that action only after reviewing it. An SMTP acceptance is submission to the mail server, not proof of inbox delivery. **Check delivery** means an interrupted/ambiguous submission; inspect the destination mailbox before creating a new proposal. There is deliberately no automatic retry of an uncertain send.

## Local Docker setup

Install Docker with Compose. Add local `.env` values for `POSTGRES_PASSWORD` and `AGENT_READ_PASSWORD` (use long URL-safe random passwords); optionally set `NEBIUS_API_KEY`. Never commit `.env`.

```sh
docker compose up --build
```

Open http://127.0.0.1:3001. PostgreSQL 17 uses a named volume and publishes only loopback port `55433`; keep the separate test cluster on `55432`. Compose waits for database health; the app runs numbered, checksummed migrations and validates the read role before listening. `HOST=0.0.0.0` is container-only; the host published port stays loopback. Named volumes preserve database and connection settings. Original browser notebooks belong to the browser origin: use the existing ZIP backup/import to transfer between development and Docker origins. Never run `docker compose down -v` unless intentionally deleting these server volumes.

Without `DATABASE_URL`, normal `npm run dev` continues using `data/workspace.json`; traces are kept in `data/agent-traces.jsonl` and shown as persistence-degraded. With PostgreSQL, configure `DATABASE_URL` (owner/migrations) and `AGENT_READ_DATABASE_URL` (separate non-superuser read role). Trace writes use a separate pool and tables; evidence-query tools receive no trace-table privileges. The local JSONL spool replays events idempotently after a database outage. `npm run db:migrate` applies migrations and grants only the three agent read views to the reader. Create that reader as a `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT` role first. The app rejects a superuser, writable reader, or reader with access to trace tables. Use a dedicated database, not an unrelated production database.

## Import and backups

**Export approved workspace** exports explicitly shared data. Import approved evidence into PostgreSQL with:

```sh
npm run db:import -- path/to/agent-workspace.json
```

The import is explicit and idempotent, preserves the original file, validates sources/references/quiz answers, and never replays deliveries, approvals or runs. A JSON workspace container (`data/workspace.json`) is also accepted. To explicitly migrate already-approved legacy source/note snapshots use `npm run db:import -- --legacy-approved data/agent.json`. Legacy textual progress is not converted into scored quiz attempts, and old tasks, plans, runs, materials and delivery records remain available through the existing agent implementation and original JSON file. Browser ZIP backups remain independent and backward compatible.

Back up PostgreSQL separately:

```sh
docker compose exec -T db pg_dump -U nemodoc -d nemodoc -Fc > workspace.dump
# Restore to a fresh, deliberately chosen database, not over a running workspace:
docker compose exec -T db pg_restore -U nemodoc -d restored_notebook --no-owner < workspace.dump
```

Create the restore database first and provision the reader there; set the two URLs to it, run migrations/role checks, and inspect records before scheduling work. Back up connection settings from the app volume securely; these contain secrets and must not enter Git. Browser ZIP backups preserve originals, annotations and local Studio artifacts, not the PostgreSQL server.

## Implementation guide

`src/workspace-types.ts` defines strict tool/API contracts. `server/workspace/repository.ts` supplies JSON and PostgreSQL implementations; `service.ts` owns snapshots, immutable attempts, proposal revisions and approvals; `read-tools.ts` enforces scoped SQL/retrieval reads; `worker.ts` owns workflow lifecycle, recovery and SMTP dispatch; `server/agent-runner.ts` supplies OpenAI Agents SDK execution with bounded inference and application validation; `evidence.ts` validates references; `routes.ts` exposes the scoped API. `ConversationComposer.tsx` extracts the current composer markup without changing its design.

The normalized schema stores notebooks → sources → pages, notes → source/page references, and quiz attempts → per-question snapshots → source/page references. Foreign keys keep scope explicit. Run steps and action lifecycle columns are relational; evolving model/action payloads use JSONB. SQL tools query read views with parameterized filters and a separate restricted reader. The server binds notebook, source and note selection; the model gets neither arbitrary SQL nor a notebook selector. Returned aggregates include filters and contributing attempt IDs, and note dates remain NULL when not established.

Document search uses the existing retrieval engine on approved extracted-text snapshots. It supplies substantive passages; SQL supplies recorded facts and counts. Retrieving a passage is not proof that a generated claim is supported. The UI exposes the evidence, and the evaluation rubric checks support separately from syntactic reference validity. Imported materials include only references actually used in content/items, following `src/lib/citations.ts`.

An approval requires proposal ID, current revision, selected IDs, explicit confirmation and an idempotency key. The repository takes a per-notebook transaction/advisory lock, checks evidence and provider fingerprints plus recipient revision, applies chosen material/plan/review changes, records a receipt and queues email together. A failure rolls everything back. A concurrent duplicate request returns the same receipt. Edits invalidate the old revision.

SMTP runs outside the database transaction. A durable pending → sending claim prevents repeated dispatch. Accepted submissions retain their message ID; definite rejections are failed; timeout/disconnection or restart during sending becomes unknown. Database records cannot make external SMTP exactly-once: the honest outcome for uncertainty is **Check delivery**. Interrupted model runs are not replayed automatically; queued work survives restart. Deploy exactly **one app worker** per workspace in V1: startup recovery assumes exclusive server ownership. Horizontal worker leases and authentication/multi-user tenancy are future deployment work, not claimed here. Loopback, browser origin checks, scoped tools and restricted DB roles protect this local single-user design; do not expose it directly to the internet.

## Evaluations and verification

`tests/fixtures/evidence-workspace.ts` is original synthetic material, with fixed dates and no user documents. It includes one MML study fixture and two synthetic research-paper extracts marked as test data. `evidence-cases.ts` defines 40 versioned cases: 16 study, 16 research, eight adversarial. Tests cover selected-source citation integrity, cross-paper comparison rules, missing quiz evidence, edits/approvals, JSON and PostgreSQL persistence, and duplicate-safe imports. Each case has an expected behavior/support rubric. Standard tests validate deterministic orchestration, permissions, SQL and SMTP; scripted provider output is explicitly **not model accuracy**. The separate live MML batch has 24 study/security cases. It no longer treats pages of one book as a multi-paper research comparison.

```sh
npm run check
npm test
# Dedicated disposable PostgreSQL 17 database + restricted reader required:
npm run test:postgres
npm run build
npm run test:e2e
```

Set `TEST_DATABASE_URL` and `TEST_READ_DATABASE_URL` only to isolated test databases. The PostgreSQL suite resets its named fixture notebook. CI provisions PostgreSQL 17 and runs these checks without model credentials.

Opt in to provider calls separately:

```sh
# Set NEMODOC_LIVE_EVAL=1 in your shell, then:
npm run eval:live
```

Optional `EVAL_CASE=study-04` runs one case. This uses the configured notebook model but no user content or SMTP connection. The report in ignored `output/evaluations/live-workflows.json` records fixture version, model/provider, full outputs, proposals, tools, reference integrity, term diagnostics, latency and available usage. Manual factual accuracy, actual citation support and security behavior fields intentionally start unscored. Term matches are not accuracy scores. Review those rubrics, preserve representative failures, redact secrets, and publish a reviewed report before claiming model quality. No live results are fabricated or bundled as successful evaluations.

The recorded walkthrough and verification status are described in [EVIDENCE_VERIFICATION.md](EVIDENCE_VERIFICATION.md).

## Agent dashboard and research interface

Open **Agent → Dashboard** for the current notebook’s recorded work. The dashboard expands across the workspace; **Research** returns to the document-side team view. Connections remain in the main navigation. Activity, memory, skills and source permissions are under **More**.

The dashboard reads saved traces, including planning and scheduled tasks, from PostgreSQL or the local JSONL activity log. Period (7/30/90/365 days), outcome and model filters apply to the displayed totals, timeline, model usage and history. Model filters count traces containing that model and sum only that model’s calls and tokens. Daily chart buckets use UTC; task timestamps use the browser’s local time. A zero activity count is distinct from unavailable token usage. The API returns an explicit partial-results flag at its 5,000-trace/100,000-telemetry-event limit or a database read failure.

**Pricing settings** accepts your USD rates per million input/output tokens, saved only in this browser. They apply retroactively to displayed estimates, grouped by provider origin and model. An estimate appears only when all calls have complete reported token usage. Missing pricing is “Not configured”; missing usage is “Incomplete usage”. These are estimates, not provider invoices. No inferred quality or hallucination scores are shown.

**Inspect** opens execution spans, errors and paginated events. **Download activity log** retrieves the complete redacted trace, and **Open findings & actions** returns to the existing reports and save/reuse controls. Viewing and filtering never invokes a model. **New research** opens a fresh reviewed-plan flow.

Research cards show current stage, assigned model and completion state, with full assignments, usage and findings available on demand. Research/review/report stages are derived from actual run records. Working indicators stop on completion/failure; the UI honors system reduced motion and **More → Reduce motion**. Motion preferences do not affect execution.
