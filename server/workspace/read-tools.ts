import { z } from "zod";
import { retrieve } from "../retrieval.ts";
import {
  notesQuerySchema,
  progressQuerySchema,
  reviewsQuerySchema,
  type WorkflowRun,
  type WorkspaceState,
  type QueryEvidence,
} from "../../src/workspace-types.ts";
import type { WorkspaceRepository } from "./repository.ts";
export const readSchemas = {
  query_notes: notesQuerySchema,
  query_quiz_progress: progressQuerySchema,
  query_review_tasks: reviewsQuerySchema,
  search_sources: z
    .object({ query: z.string().trim().min(1).max(2000) })
    .strict(),
  read_passage: z
    .object({
      sourceId: z.string().min(1).max(100),
      page: z.number().int().min(1).max(500),
    })
    .strict(),
};
export type ReadTool = keyof typeof readSchemas;
export async function executeReadTool(
  repository: WorkspaceRepository,
  run: WorkflowRun,
  state: WorkspaceState,
  name: ReadTool,
  input: unknown,
  now: number,
): Promise<{ output: unknown; summary: string }> {
  if (state.notebookId !== run.notebookId)
    throw new Error("Notebook evidence is outside this run's scope.");
  const args = readSchemas[name].parse(input) as any;
  if (name === "query_quiz_progress" && !run.includeProgress)
    throw new Error("Quiz progress was not authorized for this run.");
  if (args.sourceId && !run.sourceIds.includes(args.sourceId))
    throw new Error(
      `Source is outside this run's approved selection. Use an exact source ID from: ${run.sourceIds.join(", ")}. For query tools, omit sourceId to use all selected sources; never use a filename as an ID.`,
    );
  const nextId = () =>
    Math.max(
      0,
      ...run.citations.map((c) => c.id),
      ...run.evidence.map((e) => e.id),
    ) + 1;
  const addDocument = (c: Omit<WorkflowRun["citations"][number], "id">) => {
    const existing = run.citations.find(
      (r) =>
        r.sourceId === c.sourceId && r.page === c.page && r.text === c.text,
    );
    if (existing) return existing;
    const citation = { ...c, id: nextId() };
    run.citations.push(citation);
    return citation;
  };
  const scope = { sourceIds: run.sourceIds, noteIds: run.noteIds };
  if (
    name === "query_notes" ||
    name === "query_quiz_progress" ||
    name === "query_review_tasks"
  ) {
    const rows =
      name === "query_notes"
        ? await repository.queryNotes(run.notebookId, scope, args)
        : name === "query_quiz_progress"
          ? await repository.queryProgress(run.notebookId, scope, args.sourceId)
          : await repository.queryReviews(run.notebookId, args.status, now);
    const limit = name === "query_notes" ? args.limit : 50;
    const evidence: QueryEvidence = {
      id: nextId(),
      kind:
        name === "query_notes"
          ? "notes"
          : name === "query_quiz_progress"
            ? "progress"
            : "reviews",
      filters: args,
      records: rows.slice(0, limit).map((row) =>
        typeof row.text === "string"
          ? {
              ...row,
              text: row.text.slice(0, 2000),
              textTruncated: row.text.length > 2000,
            }
          : row,
      ),
      backend: repository.kind,
      truncated: rows.length > limit,
      at: Date.now(),
    };
    run.evidence.push(evidence);
    return {
      output: evidence,
      summary: `${name}: ${evidence.records.length} records (${evidence.backend})${evidence.truncated ? "; more records available" : ""}`,
    };
  }
  if (name === "search_sources")
    return {
      output: retrieve(
        state.sources.filter((s) => run.sourceIds.includes(s.id)),
        args.query,
        6,
      ).map(({ id: _, ...c }) => addDocument(c)),
      summary: `Searched selected documents: ${args.query}`,
    };
  const source = state.sources.find(
    (s) => s.id === args.sourceId && run.sourceIds.includes(s.id),
  );
  if (!source?.pages[args.page - 1]?.trim())
    throw new Error(
      "This page is unavailable or outside the run's approved sources.",
    );
  return {
    output: addDocument({
      sourceId: source.id,
      sourceName: source.name,
      page: args.page,
      text: source.pages[args.page - 1].slice(0, 6000),
    }),
    summary: `Read ${source.name}, page ${args.page}`,
  };
}
