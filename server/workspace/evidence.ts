import { normalizeCitations, usesCitation } from "../../src/lib/citations.ts";
import type {
  ProposalActionInput,
  WorkflowRun,
} from "../../src/workspace-types.ts";

export function evidenceIds(run: WorkflowRun) {
  return new Set([...run.citations, ...run.evidence].map((c) => c.id));
}
export function textReferences(content: string, run: WorkflowRun) {
  const normalized = normalizeCitations(content, run.citations);
  return [
    ...normalized.matchAll(
      /\[([\d\s,;]+)(?:,\s*p(?:age)?\.?\s*(\d+))?\](?!\()/gi,
    ),
  ].flatMap((m) => {
    const ids = m[1].split(/[,;]/).map((v) => Number(v.trim()));
    if (
      m[2] &&
      ids.some(
        (id) => run.citations.find((c) => c.id === id)?.page !== Number(m[2]),
      )
    )
      return [-1];
    return ids;
  });
}
export function validateActions(
  actions: ProposalActionInput[],
  run: WorkflowRun,
  now: number,
) {
  const known = evidenceIds(run),
    documents = new Set(run.citations.map((c) => c.id));
  for (const a of actions) {
    if (a.evidenceIds.some((id) => !known.has(id)))
      throw new Error(
        "An action references evidence this run never retrieved.",
      );
    const body =
      a.kind === "save_material"
        ? a.content
        : a.kind === "update_plan"
          ? a.text
          : a.kind === "send_email"
            ? a.text
            : a.prompt;
    const citations = textReferences(body, run);
    if (citations.some((id) => !known.has(id) || !a.evidenceIds.includes(id)))
      throw new Error("Action citations must match its declared evidence.");
    if (a.kind === "save_material") {
      if (
        a.materialKind === "guide" &&
        !run.citations.some((c) => usesCitation(a.content, c, run.citations))
      )
        throw new Error(
          "A guide or research brief needs supporting document citations.",
        );
      if (a.materialKind !== "guide" && a.items.length < 3)
        throw new Error("Practice materials need at least three cited items.");
      for (const item of a.items) {
        if (
          item.citationIds.some(
            (id) => !documents.has(id) || !a.evidenceIds.includes(id),
          )
        )
          throw new Error(
            "Practice items require document citations returned by this run.",
          );
        if (
          a.materialKind === "quiz" &&
          (!item.choices ||
            item.correct === undefined ||
            item.correct >= item.choices.length)
        )
          throw new Error("A quiz needs valid choices and correct indices.");
      }
    }
    if (
      a.kind === "schedule_review" &&
      (a.dueAt <= now || a.dueAt > now + 366 * 86400000)
    )
      throw new Error("Choose a future review within one year.");
  }
}
