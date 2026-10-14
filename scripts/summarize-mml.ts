import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mmlCases } from "../tests/fixtures/mml-workspace.ts";
import { auditMmlOutput } from "../tests/fixtures/mml-rubric.ts";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const live = read("output/evaluations/mml-live-final.json");
if (live.cases.length !== 40)
  throw new Error("Wait for all 40 final cases before publishing a summary.");
const stress = read("output/evaluations/mml-stress.json");
const baseline = read("output/evaluations/mml-live-baseline.json");
const reviewed = existsSync("output/evaluations/mml-quality-review.json")
  ? read("output/evaluations/mml-quality-review.json")
  : {};
const passes = (r: any) =>
  r.cases.filter((c: any) => Object.values(c.checks).every(Boolean)).length;
const latencies = live.cases
  .map((c: any) => c.latencyMs)
  .sort((a: number, b: number) => a - b);
const calls = live.cases.reduce((n: number, c: any) => n + c.run.calls, 0);
for (const c of live.cases) {
  const fixture = mmlCases.find((f) => f.id === c.id)!;
  c.instructionIssues = auditMmlOutput(
    fixture.format,
    fixture.progress,
    c.run,
    c.proposal,
  );
}
const adherence = live.cases.filter(
  (c: any) => !c.instructionIssues.length,
).length;
const reviewRows = Object.entries(reviewed)
  .map(
    ([id, value]: [string, any]) =>
      `- **${id} (${value.citationSupport})**: ${value.finding}`,
  )
  .join("\n");
const retry = existsSync("output/evaluations/mml-three-failures-retest.json")
  ? read("output/evaluations/mml-three-failures-retest.json")
  : undefined;
const rows = live.cases.map(
  (c: any) =>
    `| ${c.id} | ${Object.values(c.checks).every(Boolean) ? "Pass" : "Fail"} | ${c.run.calls} | ${(c.latencyMs / 1000).toFixed(1)} | ${reviewed[c.id]?.citationSupport ?? "Unscored"} |`,
);
const text = `# MML workflow verification results

Model: **${live.model}**, through the saved Nebius connection. Fixture revision: **${live.revision}**. Run started: ${live.date}. Core implementation commit at start: ${live.implementationCommit}. Full inputs, provider response IDs/messages, token usage, tool steps, proposals and failures are retained locally in ignored \`output/evaluations/\`; no PDF, credentials or private notes are published here.

## Live NVIDIA batch

- **${passes(live)}/40 structural passes**, using **${calls} real model calls** and real PostgreSQL 17.9.
- Per-case latency: median **${(latencies[20] / 1000).toFixed(1)} s**, p95 **${(latencies[38] / 1000).toFixed(1)} s** on this machine/provider connection.
- Each successful case included proposal editing and eight concurrent duplicate approvals, checked for one receipt and the expected material/review count. No saved SMTP connection was loaded.
- The matrix has 16 study runs (eight format/progress combinations repeated twice), 16 comparisons within one book (four repeated topics), and eight adversarial/missing-evidence cases. This is regression coverage, not 40 independent research tasks or a comprehensive security certification.
- Structural pass means completion, requested material/review type, valid reference IDs, PostgreSQL notes evidence and both requested pages, absence of premature actions, and an idempotent approval round trip. It is **not factual accuracy or semantic citation support**.
- A stricter post-run instruction audit passed **${adherence}/40**: exactly the requested action, exactly three practice items when requested, and the requested progress/review SQL queries. Extra proposed actions remain unapplied until approval; they are still instruction-following failures. This audit is reported separately from the original structural checks.

The original batch passed **${passes(baseline)}/40** structural checks. Its report is preserved. Citation-invalid proposals, a last-call completion bug and later network interruptions were observed. The final batch uses corrected code **and clearer versioned prompts**, so this is a before/after regression record, not a controlled model benchmark. Never replace those baseline failures with final outputs.

${retry ? `A separate targeted rerun of the three remaining failures passed **${passes(retry)}/${retry.cases.length}**. The original final-batch failures remain counted above; retry successes do not turn the batch into 40/40.` : ""}

| Case | Structural | Model calls | Seconds | Citation support review |
|---|---|---|---|---|
${rows.join("\n")}

## Assisted qualitative content review

The following eight cases received an additional targeted mathematical/source review. This is **Codex-assisted review, not an independent human evaluation or a random sample**. No overall factual-accuracy percentage is claimed. These failures show why structural success and human approval must remain distinct from proven content correctness.

${reviewRows}

## Concurrency and delivery stress

This separate test uses a **scripted provider**, actual 417-page MML snapshots, real HTTP, PostgreSQL and local TLS SMTP. It tests engineering behavior, not NVIDIA answer quality.

- Eight notebooks; 16 parent runs and 16 scheduled follow-up runs.
- 256 concurrent duplicate approval requests produced 16 committed approval receipts.
- Concurrent edits accepted one current revision; stale/different-key/rejected/revoked approvals were blocked.
- Exactly 16 messages reached the local SMTP sink; repeated dispatch did not resend them. No external recipient was contacted.
- ${stress.apiRequestsMeasured} timed HTTP operations (plus competing-edit requests); up to 16 concurrent requests. p50 **${stress.apiP50Ms} ms**, p95 **${stress.apiP95Ms} ms**, maximum **${stress.apiMaxMs} ms**. This is a bounded local workload, not a production capacity claim.

## Browser and regression verification

- **101 unit/API tests passed**; PostgreSQL migration/query/permission/approval/recovery integration passed.
- **36 ordinary browser tests passed**, four paid live tests skipped in that command.
- The opted-in real MML browser acceptance test passed separately: original PDF upload → synthetic notebook notes → explicit snapshot sharing → both model workflows → evidence inspection → edit → approval → duplicate-safe Studio import → reload, with no unhandled page errors.
- Real-model video: ignored \`output/mml-live-walkthrough.webm\`. The earlier distributable walkthrough uses a scripted model and remains labeled accordingly.
- Docker runtime and GitHub-hosted CI execution are still unverified here. They require Docker and a pushed workflow respectively; no deployment is claimed.

## Representative quality limits

The original live quiz included an ambiguous stem where several norm axioms were true answer choices. Another guide confused printed page labels with PDF page numbers and cited a norm page for a basis definition. Better structural validation does not prove those claims are supported. The engine now gives more specific citation repair instructions and quiz-authoring guidance, uses a deterministic summary of saved actions, and completes a valid proposal even on the final allowed call. The batch also exposed provider responses containing raw tool-call XML rather than structured calls; a subsequent guard keeps that markup inert and fails clearly after a retry. Indexed runnable-work selection avoids reloading idle PDF workspaces. Human review of mathematical content and supporting passages remains necessary.

Reproduce using [MML workflow testing](MML_WORKFLOW_TESTING.md). Full-book text and synthetic-test records stay in isolated local databases; the user's notebook and original PDF were preserved.
`;
writeFileSync("docs/MML_EVALUATION_RESULTS.md", text);
console.log(
  `Published redacted MML summary: ${passes(live)}/40 structural passes. No factual accuracy score claimed.`,
);
