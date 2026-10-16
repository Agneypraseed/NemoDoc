# MML workflow acceptance and stress testing

These commands exercise real MML book text without checking the book, user notes, secrets or raw evaluation outputs into Git. Keep the original PDF in ignored `data/mml-book.pdf`. For API/model tests, select only the MML source in Agent, approve its snapshots, then use **Export approved workspace** and save that export in ignored `output/mml-tests/source.json`. The harness replaces notes with clearly labeled synthetic basis/norm notes; it does not use personal study history.

Use dedicated PostgreSQL 17 **UTF8** databases whose names end in `_test`, with a restricted reader role. Give the stress suite, live evaluations and browser test separate databases. They each own a worker and must not consume one another's queues. Never point them at the real app database. The runner refuses non-loopback databases and names without the test suffix.

PowerShell example (replace credentials with your test-only values):

```powershell
$env:MML_SNAPSHOT_PATH='output/mml-tests/source.json'
$env:TEST_DATABASE_URL='postgresql://OWNER:PASSWORD@127.0.0.1:5432/mml_stress_test'
$env:TEST_READ_DATABASE_URL='postgresql://agent_reader:PASSWORD@127.0.0.1:5432/mml_stress_test'
npm run test:mml:stress
```

This uses a **scripted model** with the real HTTP API, 417-page MML snapshots, two clearly synthetic research-paper excerpts, PostgreSQL transactions and local TLS SMTP. It exercises eight notebooks split between both workflows, 16 parent runs, 16 scheduled runs, concurrent full snapshot refreshes, active-run rejection, competing edits, stale approval rejection, 256 duplicate approval requests, different-key conflicts, rejection, revocation and repeat email dispatch. It records latency for measured API operations in ignored `output/evaluations/mml-stress.json`. These measurements describe this local workload, not general capacity or live model accuracy.

For a live MML model run without a disposable PostgreSQL database, use an isolated JSON fixture file. This still calls the configured Nemotron model; it does not use the production workspace:

```powershell
$env:MML_SNAPSHOT_PATH='output/mml-tests/source.json'
$env:MML_BACKEND='json'
$env:NEMODOC_LIVE_EVAL='1'
$env:EVAL_CASE='study-01'
npm run eval:mml
```

The report and temporary JSON workspace stay under ignored `output/evaluations/`. The runner sends only the selected excerpts and synthetic notes/quiz records needed for this case to the saved model connection. Factual accuracy and citation support still require manual review.

For a full live matrix against PostgreSQL, select a separate database and explicitly opt in:

```powershell
$env:TEST_DATABASE_URL='postgresql://OWNER:PASSWORD@127.0.0.1:5432/mml_live_test'
$env:TEST_READ_DATABASE_URL='postgresql://agent_reader:PASSWORD@127.0.0.1:5432/mml_live_test'
$env:NEMODOC_LIVE_EVAL='1'
npm run eval:mml
# Keep another report when comparing revisions:
$env:MML_REPORT_NAME='mml-live-final.json'
# Optional focused rerun (research is exercised separately with a two-paper fixture):
$env:EVAL_CASE='study-01,study-09,security-04'
npm run eval:mml
```

The current MML batch has 24 cases: 16 study runs (eight format/progress combinations repeated twice) and eight adversarial/missing-evidence cases. The separate credential-free evaluation suite has 40 cases: 16 study cases, 16 two-paper research cases, and eight boundary cases. The research paper passages are marked synthetic test fixtures and are not copies of the PLOS PDFs. Each successful run is edited, then approved concurrently eight times; the live MML runner checks one receipt and expected material/review records. No saved SMTP settings are loaded. Fake quiz attempts are explicitly labeled synthetic. Structural passes check completion, requested action kind, reference integrity, SQL/document reads, proposal round trips, approval idempotency and absence of premature actions. **They are not factual accuracy or semantic citation support.** Full model outputs and provider response metadata remain in ignored `output/evaluations/mml-live.json`; inspect claims against the cited excerpts before publishing quality scores.

The live browser acceptance test uses a fresh browser context and actual local PDF upload:

```powershell
# Select a third dedicated UTF8 test database first.
$env:NEMODOC_MML_WORKFLOWS_LIVE='1'
npx playwright test tests/e2e/mml-workflows-live.spec.ts --output output/mml-live-browser-results
```

It follows MML upload → synthetic notes → explicit snapshot sharing → the NVIDIA study workflow → structured focus/evidence inspection → proposal edit → approval → duplicate-safe Studio import → browser reload. It uses the saved notebook model key without loading SMTP credentials. A successful video is saved to ignored `output/mml-live-walkthrough.webm`; it is a real-model MML study walkthrough. Ordinary CI skips this paid/private-fixture test and continues using the original distributable synthetic workspace.

To exercise the live multi-paper research workflow with the supplied example, import both PDFs yourself as described in [Research synthesis](RESEARCH_WORKFLOW.md), approve their snapshots in Agent, select both papers, and run **Synthesize research**. Do not use the one-book MML fixture as a research comparison.

Full regression: `npm test`, `npm run check`, `npm run test:postgres`, `npm run test:e2e`, and `npm run build`. Docker startup still requires a machine with Docker; having these scripts does not verify container startup or a hosted CI run.

[Recorded results and known failures](MML_EVALUATION_RESULTS.md) distinguish model completion, instruction adherence, source support and concurrency guarantees. `node --import tsx scripts/summarize-mml.ts` regenerates the redacted report from retained local outputs; it refuses an incomplete final batch. Raw book text and provider traces remain ignored.
