import type { Notebook, Source } from "../types";
import type { WorkflowRun } from "../workspace-types";
import { citationReferences } from "./citations";

/** A portable report includes only evidence actually cited in the saved text. */
export function researchReportMarkdown(
  run: WorkflowRun,
  includeFindings = false,
) {
  const content = run.status === "completed" ? run.answer : "";
  const findings =
    includeFindings || !content
      ? (run.researchTeam ?? [])
          .filter((a) => a.answer)
          .map((a) => `### ${a.name}\n\n${a.focus}\n\n${a.answer}`)
          .join("\n\n")
      : "";
  const evidence = [...run.citations, ...(run.webEvidence ?? [])];
  const cited = new Set(
    citationReferences([content, findings].join("\n"), evidence),
  );
  return [
    "## Research report",
    "",
    run.prompt,
    "",
    `Run: ${run.id} · ${run.status} · ${new Date(run.createdAt).toISOString()}`,
    ...(run.error ? ["", `Run stopped: ${run.error}`] : []),
    "",
    ...(content
      ? [content]
      : ["Partial findings — this run has no completed final report."]),
    ...(findings ? ["", "## Agent findings", "", findings] : []),
    "",
    "### Team",
    "",
    ...(run.researchTeam ?? []).map(
      (a) =>
        `- ${a.name}: ${a.focus} · ${a.status} · ${a.assignedModel || "model unknown"}`,
    ),
    "",
    "### Cited evidence",
    "",
    ...run.citations
      .filter((c) => cited.has(c.id))
      .map(
        (c) =>
          `- [${c.id}] ${c.sourceName}, page ${c.page}\n\n  > ${c.text.trim().replace(/\r?\n/g, "\n  > ")}`,
      ),
    ...(run.webEvidence ?? [])
      .filter((c) => cited.has(c.id))
      .map(
        (c) =>
          `- [${c.id}] ${c.title}: ${c.url} (retrieved ${new Date(c.retrievedAt).toISOString()})\n\n  > ${c.text.trim().replace(/\r?\n/g, "\n  > ")}`,
      ),
  ].join("\n");
}

export function saveResearchToNotes(
  notebook: Notebook,
  run: WorkflowRun,
  sources: Source[],
) {
  if (
    run.notebookId !== notebook.id ||
    run.status !== "completed" ||
    !run.answer.trim() ||
    notebook.savedResearchRuns?.includes(run.id)
  )
    return;
  // Removed/local-mismatched pages must not appear as supporting notebook evidence.
  const scoped = {
    ...run,
    citations: run.citations.filter((c) =>
      sources.some(
        (s) =>
          s.notebookId === notebook.id &&
          s.id === c.sourceId &&
          c.page >= 1 &&
          !!s.pages[c.page - 1],
      ),
    ),
  };
  const text = researchReportMarkdown(scoped);
  return {
    ...notebook,
    notes: `${notebook.notes.trimEnd()}${notebook.notes.trimEnd() ? "\n\n" : ""}${text}\n`,
    notesUpdatedAt: Date.now(),
    savedResearchRuns: [...(notebook.savedResearchRuns ?? []), run.id],
  };
}
