# Evidence-based notebook agents

NemoDoc's **Agent → Tasks → Evidence workflows** offers **Plan revision** and **Synthesize research**. Both use the existing configured agent connection and the same bounded engine. Existing scheduled tasks retain their previous grants. Chat, source files and browser notebooks keep their existing behavior.

## Try both workflows

1. Save notes locally. In Agent choose documents and notes, then explicitly approve storing their extracted-text snapshots on this server. No original PDF/slide file is uploaded by this operation.
2. Choose Plan revision or Synthesize research. Select approved evidence, edit the request, and optionally permit access to shared quiz progress. Choose **Create proposal**.
3. Expand **Queries, evidence & execution**. Inspect query filters, contributing note/attempt IDs, aggregate values, provider calls, and original document citations. Citation buttons open the local page. Unknown historical dates and missing quiz history remain unknown.
4. Edit individual actions. Save edits, which creates a new revision; then select actions and approve. Unselected actions are not applied. Rejecting applies nothing. Refreshing/revoking evidence invalidates pending proposals.
5. Import approved materials into Studio. Stable IDs make repeated imports update the same local artifact. Review tasks execute server-side while the server is running; an overdue task starts after restart. Its result is another proposal requiring approval.
6. To share immutable quiz attempts, check answers in Studio, then use **Remember quiz result** with an approved workspace. The complete question, choices, chosen answer, correct answer, original citations and time are snapshotted. Later quiz edits cannot rewrite them. Without an approved workspace the previous textual progress-memory behavior remains available.

For optional email, configure SMTP in Connections and explicitly ask for an email in your workflow request. The proposal shows the fixed recipient, subject, exact body and evidence footer. Select that action only after reviewing it. An SMTP acceptance is submission to the mail server, not proof of inbox delivery. **Check delivery** means an interrupted/ambiguous submission; inspect the destination mailbox before creating a new proposal. There is deliberately no automatic retry of an uncertain send.

## Local Docker setup

Install Docker with Compose. Add local `.env` values for `POSTGRES_PASSWORD` and `AGENT_READ_PASSWORD` (use long URL-safe random passwords); optionally set `NEBIUS_API_KEY`. Never commit `.env`.

```sh
docker compose up --build
```

Open http://127.0.0.1:3001. PostgreSQL 17 has no published host port. Compose waits for database health; the app runs numbered, checksummed migrations and validates the read role before listening. `HOST=0.0.0.0` is container-only; the host published port stays loopback. Named volumes preserve database and connection settings. Original browser notebooks belong to the browser origin: use the existing ZIP backup/import to transfer between development and Docker origins. Never run `docker compose down -v` unless intentionally deleting these server volumes.

Without `DATABASE_URL`, normal `npm run dev` continues using `data/workspace.json`. With PostgreSQL, configure `DATABASE_URL` (owner/migrations) and `AGENT_READ_DATABASE_URL` (separate non-superuser read role). `npm run db:migrate` applies migrations and grants only the three agent read views to the reader. Create that reader as a `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT` role first. The app rejects a superuser or writable reader. Use a dedicated database, not an unrelated production database.

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

`src/workspace-types.ts` defines strict tool/API contracts. `server/workspace/repository.ts` supplies JSON and PostgreSQL implementations; `service.ts` owns snapshots, immutable attempts, proposal revisions and approvals; `read-tools.ts` enforces scoped SQL/retrieval reads; `worker.ts` owns bounded inference, recovery and SMTP dispatch; `evidence.ts` validates references; `routes.ts` exposes the scoped API. `ConversationComposer.tsx` extracts the current composer markup without changing its design.

The normalized schema stores notebooks → sources → pages, notes → source/page references, and quiz attempts → per-question snapshots → source/page references. Foreign keys keep scope explicit. Run steps and action lifecycle columns are relational; evolving model/action payloads use JSONB. SQL tools query read views with parameterized filters and a separate restricted reader. The server binds notebook, source and note selection; the model gets neither arbitrary SQL nor a notebook selector. Returned aggregates include filters and contributing attempt IDs, and note dates remain NULL when not established.

Document search uses the existing retrieval engine on approved extracted-text snapshots. It supplies substantive passages; SQL supplies recorded facts and counts. Retrieving a passage is not proof that a generated claim is supported. The UI exposes the evidence, and the evaluation rubric checks support separately from syntactic reference validity. Imported materials include only references actually used in content/items, following `src/lib/citations.ts`.

An approval requires proposal ID, current revision, selected IDs, explicit confirmation and an idempotency key. The repository takes a per-notebook transaction/advisory lock, checks evidence and provider fingerprints plus recipient revision, applies chosen material/plan/review changes, records a receipt and queues email together. A failure rolls everything back. A concurrent duplicate request returns the same receipt. Edits invalidate the old revision.

SMTP runs outside the database transaction. A durable pending → sending claim prevents repeated dispatch. Accepted submissions retain their message ID; definite rejections are failed; timeout/disconnection or restart during sending becomes unknown. Database records cannot make external SMTP exactly-once: the honest outcome for uncertainty is **Check delivery**. Interrupted model runs are not replayed automatically; queued work survives restart. Deploy exactly **one app worker** per workspace in V1: startup recovery assumes exclusive server ownership. Horizontal worker leases and authentication/multi-user tenancy are future deployment work, not claimed here. Loopback, browser origin checks, scoped tools and restricted DB roles protect this local single-user design; do not expose it directly to the internet.

## Evaluations and verification

`tests/fixtures/evidence-workspace.ts` is original synthetic material, with fixed dates and no user documents. `evidence-cases.ts` defines 40 versioned cases: 16 study, 16 research, eight adversarial. Each has an expected behavior/support rubric. Standard tests validate deterministic orchestration, fixtures, permissions, approvals, SQL and SMTP; scripted provider output is explicitly **not model accuracy**.

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
