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

This uses a **scripted model** with the real HTTP API, 417-page MML snapshots, PostgreSQL transactions and local TLS SMTP. It exercises eight notebooks, 16 parent runs, 16 scheduled runs, concurrent full snapshot refreshes, active-run rejection, competing edits, stale approval rejection, 256 duplicate approval requests, different-key conflicts, rejection, revocation and repeat email dispatch. It records latency for measured API operations in ignored `output/evaluations/mml-stress.json`. These measurements describe this local workload, not general capacity or live model accuracy.

For live NVIDIA evaluation, select a separate database and explicitly opt in:

```powershell
$env:TEST_DATABASE_URL='postgresql://OWNER:PASSWORD@127.0.0.1:5432/mml_live_test'
$env:TEST_READ_DATABASE_URL='postgresql://agent_reader:PASSWORD@127.0.0.1:5432/mml_live_test'
$env:NEMODOC_LIVE_EVAL='1'
npm run eval:mml
# Optional focused rerun:
$env:EVAL_CASE='study-01,research-01'
npm run eval:mml
```

The 40 versioned cases comprise 16 study-format/progress combinations, 16 research comparisons within ONE book, and eight adversarial/missing-evidence cases. These are a regression matrix, not 40 independent research questions. Each successful run is edited, then approved concurrently eight times; the runner checks one receipt and the expected material/review records. No saved SMTP settings are loaded. Fake quiz attempts are explicitly labeled synthetic. A structural pass checks completion, requested action kind, reference integrity, SQL/document reads, approval idempotency and absence of premature actions. **It is not factual accuracy or semantic citation support.** Full model outputs and provider response metadata remain in ignored `output/evaluations/mml-live.json`; inspect claims against the cited excerpts before publishing quality scores.

The live browser acceptance test uses a fresh browser context and actual local PDF upload:

```powershell
# Select a third dedicated UTF8 test database first.
$env:NEMODOC_MML_WORKFLOWS_LIVE='1'
npx playwright test tests/e2e/mml-workflows-live.spec.ts
```

It follows upload → synthetic notes → explicit snapshot sharing → both NVIDIA workflows → evidence inspection → proposal edit → approval → repeated Studio import → browser reload. It uses the saved notebook model key without loading SMTP credentials. A successful video is saved to ignored `output/mml-live-walkthrough.webm`; it is a real-model walkthrough. Ordinary CI skips this paid/private-fixture test and continues using the original distributable synthetic workspace.

Full regression: `npm test`, `npm run check`, `npm run test:postgres`, `npm run test:e2e`, and `npm run build`. Docker startup still requires a machine with Docker; having these scripts does not verify container startup or a hosted CI run.
