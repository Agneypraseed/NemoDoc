import { citationReferences, usesCitation } from "../../src/lib/citations.ts";
import type {
  ProposalActionInput,
  WorkflowReport,
  WorkflowRun,
} from "../../src/workspace-types.ts";

export function evidenceIds(run: WorkflowRun) {
  return new Set([...run.citations, ...run.evidence].map((c) => c.id));
}
export function textReferences(content: string, run: WorkflowRun) {
  return citationReferences(content, [
    ...run.citations,
    ...(run.webEvidence ?? []),
  ]);
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
    const invalid = [
      ...new Set(
        citations.filter((id) => !known.has(id) || !a.evidenceIds.includes(id)),
      ),
    ];
    if (invalid.length)
      throw new Error(
        `Action content references ${invalid.map((id) => `[${id}]`).join(", ")}, which are absent from its evidenceIds or were never retrieved. Declared evidenceIds: ${a.evidenceIds.join(", ")}. Include a returned ID in evidenceIds only if used; replace invented IDs with actual supporting document IDs. Available document IDs: ${[...documents].join(", ")}.`,
      );
    if (a.kind === "save_material") {
      if (
        a.materialKind === "guide" &&
        !run.citations.some((c) => usesCitation(a.content, c, run.citations))
      )
        throw new Error(
          `A guide or research brief needs inline supporting document citations in its content, not only evidenceIds. Use returned references: ${run.citations.map((c) => `[${c.id}] ${c.sourceName}, PDF page ${c.page}`).join("; ")}. Do not invent references.`,
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
            `Practice item citationIds must be document references, not SQL query IDs, and also appear in the action's evidenceIds. Available document IDs: ${[...documents].join(", ")}.`,
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

/** Validate model-authored report links against evidence actually returned to this run. */
export function validateWorkflowReport(
  report: WorkflowReport,
  run: WorkflowRun,
) {
  if (report.kind !== run.workflow)
    throw new Error("The structured report does not match this workflow.");

  const selectedSources = new Set(run.sourceIds),
    citations = new Map(run.citations.map((c) => [c.id, c])),
    noteEvidence = run.evidence.filter((e) => e.kind === "notes"),
    noteRecords = noteEvidence.flatMap((e) => e.records),
    noteById = new Map(noteRecords.map((n) => [String(n.id), n]));
  const requireSelectedCitations = (ids: number[], label: string) => {
    const linked = ids.map((id) => citations.get(id));
    if (
      linked.some((c) => !c || !selectedSources.has(c.sourceId)) ||
      new Set(ids).size !== ids.length
    )
      throw new Error(
        `${label} must cite unique document references returned from selected sources.`,
      );
    return linked as NonNullable<(typeof linked)[number]>[];
  };

  if (report.kind === "study_revision") {
    if (!noteEvidence.length)
      throw new Error("Query approved notes before creating a study report.");
    const progressEvidence = run.evidence.filter((e) => e.kind === "progress");
    if (!run.includeProgress) {
      if (
        report.progressStatus !== "not_shared" ||
        report.progressEvidenceIds.length
      )
        throw new Error(
          "Quiz progress was not shared; report it as unknown and do not cite progress records.",
        );
    } else {
      if (!progressEvidence.length)
        throw new Error(
          "Query shared quiz progress before creating this report.",
        );
      if (progressEvidence.every((e) => e.filters.sourceId !== undefined))
        throw new Error(
          "Query quiz progress across all selected sources so the revision plan cannot silently omit mistakes.",
        );
      const expectedIds = progressEvidence
          .map((e) => e.id)
          .sort((a, b) => a - b),
        receivedIds = [...report.progressEvidenceIds].sort((a, b) => a - b),
        hasAttempts = progressEvidence.some((e) => e.records.length > 0),
        expectedStatus = hasAttempts ? "recorded" : "no_recorded_attempts";
      if (
        JSON.stringify(expectedIds) !== JSON.stringify(receivedIds) ||
        report.progressStatus !== expectedStatus
      )
        throw new Error(
          "The study report must state the shared quiz-history status and reference the returned progress queries accurately.",
        );
    }

    const progressRows = progressEvidence.flatMap((e) => e.records),
      attemptSources = new Map<string, Set<string>>();
    for (const row of progressRows) {
      const ref = JSON.stringify([row.sourceId, row.page]);
      for (const attemptId of Array.isArray(row.attemptIds)
        ? row.attemptIds
        : []) {
        const refs = attemptSources.get(String(attemptId)) ?? new Set<string>();
        refs.add(ref);
        attemptSources.set(String(attemptId), refs);
      }
    }
    const mistakes = new Set(
      progressRows.flatMap((row) =>
        Number(row.mistakes) > 0 && Array.isArray(row.attemptIds)
          ? row.attemptIds.map(String)
          : [],
      ),
    );
    const linkedMistakes = new Set<string>();
    for (const focus of report.focusAreas) {
      const rows = focus.noteIds.map((id) => noteById.get(id));
      if (rows.some((row) => !row))
        throw new Error(
          "Each study focus must link to notes returned by this run's note query.",
        );
      if (
        focus.attemptIds.some((id) => !attemptSources.has(id)) ||
        new Set(focus.attemptIds).size !== focus.attemptIds.length
      )
        throw new Error(
          "A study focus references quiz attempts that were not returned by this run.",
        );
      for (const attemptId of focus.attemptIds)
        if (mistakes.has(attemptId)) linkedMistakes.add(attemptId);

      const refs = requireSelectedCitations(focus.citationIds, "A study focus"),
        relatedRefs = new Set<string>();
      for (const row of rows as Record<string, unknown>[]) {
        for (const ref of Array.isArray(row.references) ? row.references : [])
          if (
            ref &&
            typeof ref === "object" &&
            "sourceId" in ref &&
            "page" in ref
          )
            relatedRefs.add(JSON.stringify([ref.sourceId, ref.page]));
      }
      for (const attemptId of focus.attemptIds)
        for (const ref of attemptSources.get(attemptId) ?? [])
          relatedRefs.add(ref);
      if (
        relatedRefs.size > 0 &&
        !refs.some((c) => relatedRefs.has(JSON.stringify([c.sourceId, c.page])))
      )
        throw new Error(
          "A study focus must cite a page linked to its notes or quiz mistakes.",
        );
    }
    if ([...mistakes].some((attemptId) => !linkedMistakes.has(attemptId)))
      throw new Error(
        "Link every recorded mistaken attempt to a study focus, or explicitly explain it in a focus area.",
      );
    return;
  }

  if (run.sourceIds.length < 2)
    throw new Error(
      "Research synthesis requires at least two selected papers.",
    );
  const paperIds = report.papers.map((paper) => paper.sourceId);
  if (
    new Set(paperIds).size !== paperIds.length ||
    paperIds.some((id) => !selectedSources.has(id)) ||
    selectedSources.size !== paperIds.length
  )
    throw new Error(
      "The research evidence table must include every selected paper exactly once.",
    );
  for (const paper of report.papers) {
    const refs = requireSelectedCitations(
      paper.citationIds,
      `The finding for ${paper.sourceId}`,
    );
    if (refs.some((c) => c.sourceId !== paper.sourceId))
      throw new Error(
        `The finding for ${paper.sourceId} can cite only that selected paper.`,
      );
  }
  for (const comparison of report.comparisons) {
    const refs = requireSelectedCitations(
      comparison.citationIds,
      "A cross-paper comparison",
    );
    const citedSources = new Set(refs.map((c) => c.sourceId));
    if (
      comparison.relation !== "insufficient_evidence" &&
      citedSources.size < 2
    )
      throw new Error(
        "A supports, qualifies, or conflicts comparison must cite evidence from at least two selected papers. Use insufficient_evidence when that comparison is not supported.",
      );
  }
}
