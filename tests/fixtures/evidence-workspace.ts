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
      name: "Original optimization experiment A",
      pages: [
        "On the fixed toy quadratic, a constant step of 0.1 reached loss 0.02 after 40 iterations. A step of 0.4 diverged. These observations do not establish general convergence for all functions.",
      ],
    },
    {
      id: "paper-b",
      name: "Original optimization experiment B",
      pages: [
        "On a different nonsmooth toy objective, the decreasing schedule reached loss 0.07 after 100 iterations. Constant 0.1 oscillated at 0.12. Different objectives prevent a direct controlled comparison with experiment A. No wall-clock measurements were collected.",
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
      title: "Constant step",
      text: "Step 0.1 worked on the smooth toy objective; 0.4 diverged.",
      tags: ["optimization"],
      references: [{ sourceId: "paper-a", page: 1 }],
      savedAt: fixedDate - 172800000,
    },
    {
      id: "opt-b",
      kind: "passage" as const,
      title: "Decreasing step",
      text: "Decreasing schedule helped the nonsmooth experiment. Objective differs from A.",
      tags: ["optimization"],
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
    const results = body.messages.filter((m: any) => m.role === "tool");
    const tool = (name: string, args: unknown) => ({
      content: null,
      tool_calls: [
        {
          id: `call-${results.length}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });
    let message: unknown;
    if (!results.length) message = tool("query_notes", {});
    else if (results.length === 1)
      message = tool("read_passage", {
        sourceId: body.messages[0].content.includes('"id":"book"')
          ? "book"
          : "paper-a",
        page: 1,
      });
    else if (results.length === 2)
      message = tool("propose_actions", {
        actions: [
          {
            kind: "save_material",
            materialKind: "guide",
            title: "Evidence brief",
            content: "Review the selected original passage. [2]",
            items: [],
            evidenceIds: [1, 2],
          },
          {
            kind: "update_plan",
            text: "Read the cited passage and practice recalling its conditions. [2]",
            evidenceIds: [1, 2],
          },
        ],
      });
    else
      message = {
        content:
          "The notes are recorded in [1]. Review this original passage [2] and the proposed actions. No changes have been applied.",
      };
    return Response.json({
      choices: [{ message }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
  }) as typeof fetch;
}
