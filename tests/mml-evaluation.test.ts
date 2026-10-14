import test from "node:test";
import assert from "node:assert/strict";
import { mmlCases } from "./fixtures/mml-workspace.ts";
import { auditMmlOutput } from "./fixtures/mml-rubric.ts";
import type { WorkflowRun, ActionProposal } from "../src/workspace-types.ts";

test("MML matrix preserves 16 study, 16 research and eight security cases without bundling the PDF", () => {
  assert.equal(mmlCases.length, 40);
  assert.equal(new Set(mmlCases.map((c) => c.id)).size, 40);
  for (const [prefix, count] of [
    ["study", 16],
    ["research", 16],
    ["security", 8],
  ] as const)
    assert.equal(mmlCases.filter((c) => c.id.startsWith(prefix)).length, count);
});
test("MML scoring catches overproduction and skipped SQL tools instead of treating completion as instruction accuracy", () => {
  const run = { evidence: [] } as unknown as WorkflowRun;
  const proposal = {
    actions: [
      {
        kind: "save_material",
        materialKind: "flashcards",
        items: Array(6).fill({}),
      },
      { kind: "update_plan" },
    ],
  } as ActionProposal;
  const issues = auditMmlOutput("flashcards", true, run, proposal);
  assert.ok(issues.some((i) => i.includes("exactly one")));
  assert.ok(issues.some((i) => i.includes("exactly three")));
  assert.ok(issues.some((i) => i.includes("progress")));
  assert.ok(issues.some((i) => i.includes("review-task")));
});
