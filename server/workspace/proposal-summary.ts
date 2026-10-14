import type { ActionProposal, WorkflowRun } from "../../src/workspace-types.ts";

/** Execution status comes from persisted actions, never a model's closing claims. */
export function proposalSummary(run: WorkflowRun, proposal: ActionProposal) {
  const lines = proposal.actions.map((a, i) => {
    const label =
      a.kind === "save_material"
        ? `${a.materialKind}: ${a.title}`
        : a.kind === "schedule_review"
          ? `Review: ${a.title} — ${new Date(a.dueAt).toISOString()}`
          : a.kind === "update_plan"
            ? "Update notebook plan"
            : `Email preview: ${a.title}`;
    return `${i + 1}. ${label} ${a.evidenceIds.map((id) => `[${id}]`).join(" ")}`;
  });
  const progress = run.evidence.filter((e) => e.kind === "progress");
  const missing = !run.includeProgress
    ? "Quiz history was not shared; no learning weakness is inferred."
    : progress.length && progress.every((e) => e.records.length === 0)
      ? "No recorded quiz attempts were found; this is missing evidence, not a learning weakness."
      : "";
  return [
    `Review ${proposal.actions.length} proposed action${proposal.actions.length === 1 ? "" : "s"} (revision ${proposal.revision}). Nothing has been applied or sent.`,
    ...lines,
    missing,
    `Retrieved pages: ${run.citations.map((c) => `[${c.id}] ${c.sourceName}, PDF page ${c.page}`).join("; ")}.`,
    "Edit and approve selected actions, or reject the proposal.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
