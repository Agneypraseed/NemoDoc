import type { WorkspaceState } from "../../src/workspace-types.ts";
export const fixtureRevision = "evidence-v1";
export const fixedDate = Date.parse("2026-10-14T12:00:00Z");
export const snapshot = {
  notebookId: "fixture",
  title: "Linear spaces and optimization",
  consent: true as const,
  sources: [
    {
      id: "book",
      name: "Original linear spaces notes",
      pages: [
        "A basis is a linearly independent generating set. In R2, (1,0) and (0,1) form a basis. Three vectors in R2 cannot be independent.",
        "Rank is the dimension of the image. For a map with domain dimension 5 and rank 3, the kernel has dimension 2 by rank-nullity.",
      ],
    },
    {
      id: "paper-a",
      name: "Synthetic Ritchie et al. (2013) excerpt — primary-school study",
      pages: [
        "TEST FIXTURE EXCERPT (not the article PDF): Ritchie et al. studied retrieval practice and mind mapping with primary-school children. The study reports improved factual learning after retrieval practice, including delayed testing. Its participants and classroom task do not establish an effect for workplace training.",
      ],
    },
    {
      id: "paper-b",
      name: "Synthetic Okano et al. (2018) excerpt — workplace study",
      pages: [
        "TEST FIXTURE EXCERPT (not the article PDF): Okano et al. studied digital learning among workplace employees. Interspersed testing with structured discussion improved next-day retention; spontaneous discussion alone did not show the same significant effect. This employee training setting differs from a primary-school classroom and is not a head-to-head comparison with Ritchie et al.",
      ],
    },
  ],
  notes: [
    {
      id: "basis",
      kind: "notebook" as const,
      title: "Basis and redundancy",
      text: "A basis spans the space with no unnecessary vectors.",
      tags: ["algebra"],
      references: [{ sourceId: "book", page: 1 }],
      savedAt: fixedDate - 86400000,
    },
    {
      id: "rank",
      kind: "answer" as const,
      title: "Rank-nullity",
      text: "Domain dimension 5 minus rank 3 gives kernel dimension 2.",
      tags: ["algebra"],
      references: [{ sourceId: "book", page: 2 }],
    },
    {
      id: "opt-a",
      kind: "highlight" as const,
      title: "Retrieval practice in primary school",
      text: "Retrieval practice improved factual learning in a primary-school setting.",
      tags: ["retrieval", "learning"],
      references: [{ sourceId: "paper-a", page: 1 }],
      savedAt: fixedDate - 172800000,
    },
    {
      id: "opt-b",
      kind: "passage" as const,
      title: "Digital learning at work",
      text: "Structured discussion with interspersed testing helped next-day retention in workplace training.",
      tags: ["retrieval", "learning"],
      references: [{ sourceId: "paper-b", page: 1 }],
      savedAt: fixedDate - 86400000,
    },
  ],
};
export const attempt = {
  id: "attempt-1",
  notebookId: "fixture",
  artifactId: "basis-quiz",
  title: "Basis practice",
  completedAt: fixedDate - 3600000,
  consent: true as const,
  answers: [
    {
      question: "Can three vectors in R2 form a basis?",
      choices: ["Yes", "No"],
      selected: 0,
      correct: 1,
      references: [{ sourceId: "book", page: 1 }],
    },
    {
      question: "Can a basis contain redundant vectors?",
      choices: ["Yes", "No"],
      selected: 1,
      correct: 1,
      references: [{ sourceId: "book", page: 1 }],
    },
  ],
};
export const selected = (state: WorkspaceState) => ({
  sourceIds: state.sources.map((s) => s.id),
  noteIds: state.notes.map((n) => n.id),
});
export function scriptedModel(): typeof fetch {
  return (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const system =
      body.messages.find((m: any) => m.role === "system")?.content ?? "";
    const results = body.messages.filter((m: any) => m.role === "tool");
    const workflow = system.includes("Workflow: research_synthesis")
      ? "research_synthesis"
      : "study_revision";
    const docs = JSON.parse(
      system.split("Selected documents: ")[1]?.split("\n")[0] ?? "[]",
    ) as { id: string; name: string }[];
    const parseResult = (message: any) => {
      try {
        return JSON.parse(message.content);
      } catch {
        return undefined;
      }
    };
    const outputs = results.map(parseResult).filter(Boolean);
    const notes = outputs.find((value: any) => value.kind === "notes");
    const citations = outputs.filter(
      (value: any) => value.sourceId && Number.isInteger(value.page),
    );
    const tool = (name: string, args: unknown) => ({
      content: null,
      tool_calls: [
        {
          id: `call-${results.length}-${name}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });
    let message: unknown;
    if (!notes) message = tool("query_notes", {});
    else if (workflow === "research_synthesis") {
      const missing = docs.find(
        (doc) =>
          !citations.some((citation: any) => citation.sourceId === doc.id),
      );
      if (missing)
        message = tool("read_passage", { sourceId: missing.id, page: 1 });
    }
    if (!message && !citations.length && workflow === "study_revision") {
      const firstNote = notes.records?.[0];
      const reference = firstNote?.references?.find((ref: any) =>
        docs.some((doc) => doc.id === ref.sourceId),
      );
      message = tool("read_passage", {
        sourceId: reference?.sourceId ?? docs[0]?.id,
        page: reference?.page ?? 1,
      });
    }
    const progress = outputs.filter((value: any) => value.kind === "progress");
    const includeProgress = /Progress consent: true/.test(system);
    if (
      !message &&
      workflow === "study_revision" &&
      includeProgress &&
      !progress.length
    )
      message = tool("query_quiz_progress", {});
    if (!message) {
      const noteEvidence = outputs.find((value: any) => value.kind === "notes");
      const allEvidenceIds = [
        ...outputs.map((value: any) => value.id).filter(Number.isInteger),
        ...citations.map((value: any) => value.id),
      ];
      const docCitationIds = citations.map((value: any) => value.id);
      const firstCitation = docCitationIds[0] ?? 2;
      const actionIds = [...new Set(allEvidenceIds)];
      const report =
        workflow === "study_revision"
          ? {
              kind: "study_revision",
              progressStatus: !includeProgress
                ? "not_shared"
                : progress.some((e: any) => e.records?.length)
                  ? "recorded"
                  : "no_recorded_attempts",
              progressEvidenceIds: progress.map((e: any) => e.id),
              focusAreas: [
                {
                  topic:
                    noteEvidence.records[0]?.title ?? "Selected study note",
                  observation:
                    "Review the idea in your note, then retrieve the cited page from memory.",
                  noteIds: [noteEvidence.records[0]?.id ?? "basis"],
                  attemptIds: progress.flatMap((e: any) =>
                    e.records
                      .filter((row: any) => Number(row.mistakes) > 0)
                      .flatMap((row: any) => row.attemptIds ?? []),
                  ),
                  citationIds: [firstCitation],
                },
              ],
            }
          : {
              kind: "research_synthesis",
              papers: docs.map((doc) => {
                const citation = citations.find(
                  (value: any) => value.sourceId === doc.id,
                );
                return {
                  sourceId: doc.id,
                  finding:
                    citation?.text ?? "No finding in the retrieved excerpt.",
                  methodPopulation: "See the retrieved paper excerpt.",
                  citationIds: citation ? [citation.id] : [],
                };
              }),
              comparisons: [
                {
                  question: "Are the findings directly comparable?",
                  relation: "qualifies",
                  explanation:
                    "The papers examine different learning settings, so compare their findings with that context in view.",
                  citationIds: docCitationIds.slice(0, 2),
                },
              ],
              unsupportedClaims: [],
            };
      message = tool("propose_actions", {
        report,
        actions: [
          {
            kind: "save_material",
            materialKind: "guide",
            title:
              workflow === "research_synthesis"
                ? "Research evidence brief"
                : "Evidence brief",
            content: `Review the selected evidence and its limits. [${firstCitation}]`,
            items: [],
            evidenceIds: actionIds,
          },
          {
            kind: "update_plan",
            text: `Read the cited passage and practice recalling its conditions. [${firstCitation}]`,
            evidenceIds: actionIds,
          },
        ],
      });
    }
    return Response.json({
      choices: [{ message }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
  }) as typeof fetch;
}
