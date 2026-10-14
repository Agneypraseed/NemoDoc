import type { ActionProposal, WorkflowRun } from "../../src/workspace-types.ts";

/** Mechanical instruction-following checks, separate from factual judgments. */
export function auditMmlOutput(
  format: string,
  progress: boolean,
  run: WorkflowRun,
  proposal?: ActionProposal,
) {
  const issues: string[] = [];
  if (!proposal) return ["No proposal"];
  if (proposal.actions.length !== 1)
    issues.push(
      "Expected exactly one requested action; extra/missing actions proposed",
    );
  for (const a of proposal.actions) {
    if (format === "review") {
      if (a.kind !== "schedule_review")
        issues.push("Unexpected action type for review-only request");
    } else if (a.kind !== "save_material" || a.materialKind !== format)
      issues.push("Unexpected action/material format");
    if (
      a.kind === "save_material" &&
      ["quiz", "flashcards"].includes(format) &&
      a.items.length !== 3
    )
      issues.push("Expected exactly three practice items");
  }
  if (progress && !run.evidence.some((e) => e.kind === "progress"))
    issues.push("Shared quiz progress was not queried");
  if (!run.evidence.some((e) => e.kind === "reviews"))
    issues.push("Requested review-task query was not performed");
  return [...new Set(issues)];
}
