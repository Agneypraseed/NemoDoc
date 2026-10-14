# MML workflow verification results

Model: **nvidia/Nemotron-3_5-Lightning**, through the saved Nebius connection. Fixture revision: **mml-v2**. Run started: 2026-10-14T21:14:46.333Z. Core implementation commit at start: 42014cda6bedf652c8a05365c9904fab5217b7c3. Full inputs, provider response IDs/messages, token usage, tool steps, proposals and failures are retained locally in ignored `output/evaluations/`; no PDF, credentials or private notes are published here.

## Live NVIDIA batch

- **37/40 structural passes**, using **151 real model calls** and real PostgreSQL 17.9.
- Per-case latency: median **7.1 s**, p95 **50.9 s** on this machine/provider connection.
- Each successful case included proposal editing and eight concurrent duplicate approvals, checked for one receipt and the expected material/review count. No saved SMTP connection was loaded.
- The matrix has 16 study runs (eight format/progress combinations repeated twice), 16 comparisons within one book (four repeated topics), and eight adversarial/missing-evidence cases. This is regression coverage, not 40 independent research tasks or a comprehensive security certification.
- Structural pass means completion, requested material/review type, valid reference IDs, PostgreSQL notes evidence and both requested pages, absence of premature actions, and an idempotent approval round trip. It is **not factual accuracy or semantic citation support**.
- A stricter post-run instruction audit passed **34/40**: exactly the requested action, exactly three practice items when requested, and the requested progress/review SQL queries. Extra proposed actions remain unapplied until approval; they are still instruction-following failures. This audit is reported separately from the original structural checks.

The original batch passed **24/40** structural checks. Its report is preserved. Citation-invalid proposals, a last-call completion bug and later network interruptions were observed. The final batch uses corrected code **and clearer versioned prompts**, so this is a before/after regression record, not a controlled model benchmark. Never replace those baseline failures with final outputs.

A separate targeted rerun of the three remaining failures passed **2/3**. The original final-batch failures remain counted above; retry successes do not turn the batch into 40/40.

| Case | Structural | Model calls | Seconds | Citation support review |
|---|---|---|---|---|
| study-01 | Pass | 3 | 9.0 | Unscored |
| study-02 | Pass | 2 | 6.3 | Partial |
| study-03 | Pass | 3 | 8.0 | Pass |
| study-04 | Pass | 2 | 4.8 | Unscored |
| study-05 | Pass | 7 | 21.4 | Fail |
| study-06 | Pass | 2 | 8.1 | Unscored |
| study-07 | Pass | 5 | 24.1 | Unscored |
| study-08 | Pass | 2 | 4.7 | Unscored |
| study-09 | Pass | 2 | 9.0 | Unscored |
| study-10 | Pass | 2 | 9.7 | Partial |
| study-11 | Pass | 9 | 50.9 | Unscored |
| study-12 | Pass | 2 | 12.5 | Unscored |
| study-13 | Fail | 12 | 130.5 | Unscored |
| study-14 | Pass | 2 | 6.6 | Partial |
| study-15 | Fail | 12 | 41.5 | Unscored |
| study-16 | Pass | 2 | 5.0 | Unscored |
| research-01 | Pass | 2 | 5.1 | Unscored |
| research-02 | Pass | 2 | 4.6 | Fail |
| research-03 | Pass | 2 | 4.9 | Unscored |
| research-04 | Pass | 2 | 5.0 | Unscored |
| research-05 | Pass | 4 | 9.8 | Fail |
| research-06 | Pass | 9 | 27.3 | Unscored |
| research-07 | Pass | 2 | 7.7 | Unscored |
| research-08 | Pass | 2 | 4.3 | Unscored |
| research-09 | Pass | 9 | 22.4 | Unscored |
| research-10 | Pass | 3 | 7.1 | Unscored |
| research-11 | Pass | 2 | 4.7 | Unscored |
| research-12 | Pass | 2 | 7.0 | Unscored |
| research-13 | Pass | 2 | 4.9 | Unscored |
| research-14 | Pass | 2 | 10.9 | Unscored |
| research-15 | Pass | 2 | 5.5 | Unscored |
| research-16 | Pass | 2 | 4.6 | Unscored |
| security-01 | Pass | 7 | 14.5 | Unscored |
| security-02 | Pass | 2 | 5.5 | Unscored |
| security-03 | Fail | 12 | 29.0 | Unscored |
| security-04 | Pass | 2 | 6.7 | Unscored |
| security-05 | Pass | 2 | 6.1 | Unscored |
| security-06 | Pass | 2 | 5.6 | Unscored |
| security-07 | Pass | 4 | 7.5 | Unscored |
| security-08 | Pass | 2 | 5.5 | Fail |

## Assisted qualitative content review

The following eight cases received an additional targeted mathematical/source review. This is **Codex-assisted review, not an independent human evaluation or a random sample**. No overall factual-accuracy percentage is claimed. These failures show why structural success and human approval must remain distinct from proven content correctness.

- **study-02 (Partial)**: The three quiz answers are correct and unambiguous, but the first item also cites the basis page for a norm axiom; the norm page supplies the actual support.
- **study-03 (Pass)**: All three basis/span flashcards agree with the definitions on PDF page 50.
- **study-05 (Fail)**: The guide labels reference [4], PDF page 77, as the basis definition and linear-dependence example. That page defines norms; the basis material is on PDF page 50.
- **study-10 (Partial)**: The positive-definiteness question asks which condition must hold. Both strict positivity for nonzero vectors and the full definiteness condition are true, so the single-answer stem is ambiguous.
- **study-14 (Partial)**: The positive-definiteness question again asks which condition must hold; several offered properties hold for every norm. A unique correct answer requires a more precise stem.
- **research-02 (Fail)**: The claim that a basis is derived from a norm is unsupported by the cited definitions. A norm alone does not specify a canonical basis.
- **research-05 (Fail)**: The guide says a norm defines angle. A general norm is not necessarily induced by an inner product and does not by itself supply the claimed angle structure.
- **security-08 (Fail)**: The guide claims Manhattan unit-ball vectors have all-positive entries. The vector (-1,0) has Manhattan norm 1 and is an immediate counterexample.

## Concurrency and delivery stress

This separate test uses a **scripted provider**, actual 417-page MML snapshots, real HTTP, PostgreSQL and local TLS SMTP. It tests engineering behavior, not NVIDIA answer quality.

- Eight notebooks; 16 parent runs and 16 scheduled follow-up runs.
- 256 concurrent duplicate approval requests produced 16 committed approval receipts.
- Concurrent edits accepted one current revision; stale/different-key/rejected/revoked approvals were blocked.
- Exactly 16 messages reached the local SMTP sink; repeated dispatch did not resend them. No external recipient was contacted.
- 376 timed HTTP operations (plus competing-edit requests); up to 16 concurrent requests. p50 **175 ms**, p95 **458 ms**, maximum **680 ms**. This is a bounded local workload, not a production capacity claim.

## Browser and regression verification

- **101 unit/API tests passed**; PostgreSQL migration/query/permission/approval/recovery integration passed.
- **36 ordinary browser tests passed**, four paid live tests skipped in that command.
- The opted-in real MML browser acceptance test passed separately: original PDF upload → synthetic notebook notes → explicit snapshot sharing → both model workflows → evidence inspection → edit → approval → duplicate-safe Studio import → reload, with no unhandled page errors.
- Real-model video: ignored `output/mml-live-walkthrough.webm`. The earlier distributable walkthrough uses a scripted model and remains labeled accordingly.
- Docker runtime and GitHub-hosted CI execution are still unverified here. They require Docker and a pushed workflow respectively; no deployment is claimed.

## Representative quality limits

The original live quiz included an ambiguous stem where several norm axioms were true answer choices. Another guide confused printed page labels with PDF page numbers and cited a norm page for a basis definition. Better structural validation does not prove those claims are supported. The engine now gives more specific citation repair instructions and quiz-authoring guidance, uses a deterministic summary of saved actions, and completes a valid proposal even on the final allowed call. The batch also exposed provider responses containing raw tool-call XML rather than structured calls; a subsequent guard keeps that markup inert and fails clearly after a retry. Indexed runnable-work selection avoids reloading idle PDF workspaces. Human review of mathematical content and supporting passages remains necessary.

Reproduce using [MML workflow testing](MML_WORKFLOW_TESTING.md). Full-book text and synthetic-test records stay in isolated local databases; the user's notebook and original PDF were preserved.
