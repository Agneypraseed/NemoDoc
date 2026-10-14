import { z } from "zod";
import type {
  AgentCitation,
  AgentMaterial,
  DeliveryTarget,
} from "./agent-types";

const id = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((v) => !v.includes("\0"), "IDs cannot contain NUL characters.");
export const workflowSchema = z.enum(["study_revision", "research_synthesis"]);
export type EvidenceWorkflow = z.infer<typeof workflowSchema>;
const referenceSchema = z
  .object({ sourceId: id, page: z.number().int().min(1).max(500) })
  .strict();
export const workspaceNoteSchema = z
  .object({
    id,
    title: z.string().max(500),
    text: z
      .string()
      .trim()
      .min(1)
      .max(50000)
      .transform((v) => v.replace(/\0/g, ""))
      .refine((v) => !!v.trim(), "A note needs readable text."),
    kind: z.enum(["answer", "passage", "highlight", "notebook"]),
    tags: z.array(z.string().max(100)).max(30).default([]),
    references: z.array(referenceSchema).max(100).default([]),
    savedAt: z.number().int().nonnegative().optional(),
    updatedAt: z.number().int().nonnegative().optional(),
  })
  .strict();
export type WorkspaceNote = z.infer<typeof workspaceNoteSchema>;
export const workspaceSourceSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(250),
    // PDF extractors can emit NUL separators; PostgreSQL text cannot represent them.
    pages: z
      .array(
        z
          .string()
          .max(100000)
          .transform((v) => v.replace(/\0/g, "")),
      )
      .min(1)
      .max(500),
  })
  .strict();
export type WorkspaceSource = z.infer<typeof workspaceSourceSchema>;
export const snapshotSchema = z
  .object({
    notebookId: id,
    title: z.string().trim().min(1).max(250),
    sources: z.array(workspaceSourceSchema).max(30),
    notes: z.array(workspaceNoteSchema).max(1000),
    consent: z.literal(true),
  })
  .strict();
export const quizAttemptSchema = z
  .object({
    id,
    notebookId: id,
    artifactId: id,
    title: z.string().min(1).max(250),
    completedAt: z.number().int().nonnegative(),
    consent: z.literal(true),
    answers: z
      .array(
        z
          .object({
            question: z.string().min(1).max(4000),
            choices: z.array(z.string().max(2000)).min(2).max(10),
            selected: z.number().int().nonnegative(),
            correct: z.number().int().nonnegative(),
            references: z.array(referenceSchema).min(1).max(20),
          })
          .strict()
          .refine(
            (a) =>
              a.selected < a.choices.length && a.correct < a.choices.length,
            "Invalid quiz answer.",
          ),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type QuizAttempt = Omit<z.infer<typeof quizAttemptSchema>, "consent">;
export const notesQuerySchema = z
  .object({
    sourceId: id.optional(),
    kind: workspaceNoteSchema.shape.kind.optional(),
    tag: z.string().max(100).optional(),
    since: z.number().int().nonnegative().optional(),
    until: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export type NotesQuery = z.infer<typeof notesQuerySchema>;
export const progressQuerySchema = z
  .object({ sourceId: id.optional() })
  .strict();
export const reviewsQuerySchema = z
  .object({ status: z.enum(["pending", "completed", "overdue"]).optional() })
  .strict();
const refs = z.array(z.number().int().positive()).min(1).max(100);
const practiceItem = z
  .object({
    question: z.string().min(1).max(2000),
    answer: z.string().min(1).max(4000),
    choices: z.array(z.string().max(2000)).min(2).max(10).optional(),
    correct: z.number().int().nonnegative().optional(),
    citationIds: refs,
  })
  .strict();
export const proposalActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("save_material"),
      title: z.string().min(1).max(250),
      materialKind: z.enum(["guide", "flashcards", "quiz"]),
      content: z.string().max(16000),
      items: z.array(practiceItem).max(30).default([]),
      evidenceIds: refs,
    })
    .strict(),
  z
    .object({
      kind: z.literal("update_plan"),
      text: z.string().min(1).max(6000),
      evidenceIds: refs,
    })
    .strict(),
  z
    .object({
      kind: z.literal("schedule_review"),
      title: z.string().min(1).max(150),
      prompt: z.string().min(1).max(4000),
      dueAt: z.number().int().nonnegative(),
      evidenceIds: refs,
    })
    .strict(),
  z
    .object({
      kind: z.literal("send_email"),
      title: z.string().min(1).max(250),
      text: z.string().min(1).max(16000),
      evidenceIds: refs,
    })
    .strict(),
]);
export type ProposalActionInput = z.infer<typeof proposalActionSchema>;
export type ProposalAction = ProposalActionInput & { id: string };
export const proposeSchema = z
  .object({ actions: z.array(proposalActionSchema).min(1).max(8) })
  .strict();
export const workflowTaskSchema = z
  .object({
    notebookId: id,
    workflow: workflowSchema,
    prompt: z.string().trim().min(1).max(8000),
    sourceIds: z.array(id).max(30),
    noteIds: z.array(id).max(1000),
    includeProgress: z.boolean().default(false),
  })
  .strict();
export type WorkflowTask = z.infer<typeof workflowTaskSchema>;
export interface QueryEvidence {
  id: number;
  kind: "notes" | "progress" | "reviews";
  filters: Record<string, unknown>;
  records: Record<string, unknown>[];
  backend: "json" | "postgres";
  truncated: boolean;
  at: number;
}
export interface WorkflowRun extends WorkflowTask {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "interrupted";
  snapshotRevision: string;
  connection: {
    baseUrl: string;
    model: string;
    mode: string;
    configurationRevision: string;
  };
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  answer: string;
  error?: string;
  calls: number;
  steps: { tool: string; summary: string; at: number }[];
  citations: AgentCitation[];
  evidence: QueryEvidence[];
  usage?: { promptTokens: number; completionTokens: number };
}
export interface ActionProposal {
  id: string;
  notebookId: string;
  runId: string;
  revision: number;
  status: "pending" | "approved" | "rejected" | "stale";
  snapshotRevision: string;
  connection: WorkflowRun["connection"];
  emailTarget?: DeliveryTarget;
  actions: ProposalAction[];
  createdAt: number;
}
export interface WorkspaceReview {
  id: string;
  title: string;
  prompt: string;
  dueAt: number;
  status: "pending" | "completed";
  createdAt: number;
  proposalId: string;
  resultRunId?: string;
}
export interface WorkspaceOutbox {
  id: string;
  proposalId: string;
  actionId: string;
  target: DeliveryTarget;
  title: string;
  text: string;
  status: "pending" | "sending" | "accepted" | "failed" | "unknown";
  createdAt: number;
  messageId?: string;
  error?: string;
}
export interface ApprovalReceipt {
  key: string;
  proposalId: string;
  revision: number;
  actionIds: string[];
  at: number;
}
export interface WorkspaceState {
  notebookId: string;
  title: string;
  revision: string;
  approvedAt: number;
  sources: WorkspaceSource[];
  notes: WorkspaceNote[];
  attempts: QuizAttempt[];
  runs: WorkflowRun[];
  proposals: ActionProposal[];
  materials: AgentMaterial[];
  reviews: WorkspaceReview[];
  plan: string;
  outbox: WorkspaceOutbox[];
  receipts: ApprovalReceipt[];
}
export const emptyWorkspace = (notebookId: string): WorkspaceState => ({
  notebookId,
  title: "",
  revision: "",
  approvedAt: 0,
  sources: [],
  notes: [],
  attempts: [],
  runs: [],
  proposals: [],
  materials: [],
  reviews: [],
  plan: "",
  outbox: [],
  receipts: [],
});
