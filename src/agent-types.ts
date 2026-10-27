import { z } from "zod";
import type { ResearchStage } from "./trace-types";
import type { AgentFile } from "./agent-file-types";
const id = z.string().min(1).max(100);
export const memoryInput = z.object({
  id: id.optional(),
  notebookId: id,
  kind: z.enum(["goal", "preference", "progress"]),
  text: z.string().trim().min(1).max(2000),
  deadline: z.string().max(40).default(""),
});
export const skillInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(100),
  instructions: z.string().trim().min(1).max(5000),
});
export const sharedSource = z.object({
  id,
  notebookId: id,
  name: z.string().min(1).max(250),
  pages: z.array(z.string().max(100000)).max(500),
  kind: z.enum(["document", "notes"]).optional(),
});
export const taskInput = z
  .object({
    notebookId: id,
    title: z.string().trim().min(1).max(150),
    prompt: z.string().trim().min(1).max(8000),
    instructions: z.string().trim().max(5000).optional(),
    allowDelegation: z.boolean().optional(),
    agentInstructions: z
      .object({
        researcher: z.string().trim().max(3000).optional(),
        webResearcher: z.string().trim().max(3000).optional(),
      })
      .strict()
      .optional(),
    skillId: id,
    sourceIds: z.array(id).max(30),
    fileIds: z.array(z.uuid()).max(20).optional(),
    allowFileWrites: z.boolean().optional(),
    allowWeb: z.boolean().optional(),
    webRevision: z.string().max(100).optional(),
    dueAt: z.number().int().nonnegative(),
    repeatHours: z
      .union([z.literal(0), z.number().int().min(24).max(168)])
      .default(0),
    allowMemory: z.boolean().default(false),
    allowSchedule: z.boolean().default(false),
    schedule: z
      .object({
        kind: z.literal("weekdays"),
        time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
        timeZone: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .refine((value) => {
            try {
              new Intl.DateTimeFormat("en-US", { timeZone: value });
              return true;
            } catch {
              return false;
            }
          }, "Choose a valid time zone."),
      })
      .optional(),
    channelRevisions: z
      .object({ email: z.string().optional(), whatsapp: z.string().optional() })
      .optional(),
    channels: z
      .array(z.enum(["email", "whatsapp"]))
      .max(2)
      .default([]),
  })
  .strict()
  .refine(
    (task) => !task.schedule || task.repeatHours === 0,
    "Choose a weekday schedule or an interval, not both.",
  )
  .refine(
    (task) =>
      task.sourceIds.length > 0 || !!task.fileIds?.length || task.allowWeb,
    "Select a source or file, or allow public web research.",
  );
export type AgentMemory = z.infer<typeof memoryInput> & {
  id: string;
  updatedAt: number;
};
export type AgentSkill = z.infer<typeof skillInput> & { id: string };
export type SharedSource = z.infer<typeof sharedSource>;
export type AgentTask = z.infer<typeof taskInput> & {
  id: string;
  status: "active" | "paused" | "done" | "cancelled";
  connection: { baseUrl: string; model: string };
  createdAt: number;
  connectionMode?: "notebook" | "custom";
  manualRun?: boolean;
  deliveries?: DeliveryTarget[];
};
export interface AgentCitation {
  id: number;
  sourceId: string;
  sourceName: string;
  page: number;
  text: string;
  kind?: "file" | "web";
  url?: string;
  retrievedAt?: number;
}
export interface AgentMaterial {
  id: string;
  kind: "guide" | "flashcards" | "quiz";
  title: string;
  content: string;
  items: {
    question: string;
    answer: string;
    choices?: string[];
    correct?: number;
    citationIds: number[];
  }[];
  citations: AgentCitation[];
  createdAt: number;
}
export interface AgentRun {
  id: string;
  traceId?: string;
  stage?: ResearchStage;
  taskId: string;
  notebookId: string;
  title: string;
  status: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  startedAt: number;
  finishedAt?: number;
  answer: string;
  error?: string;
  connection: { baseUrl: string; model: string };
  steps: {
    tool: string;
    summary: string;
    at: number;
    status?: "succeeded" | "rejected" | "failed";
    callId?: string;
    agentId?: string;
    agentName?: string;
  }[];
  files?: AgentFile[];
  toolAccess?: {
    web: boolean;
    fileIds: string[];
    writeFiles: boolean;
    delegation?: boolean;
  };
  agents?: AgentDelegate[];
  modelCallLimit?: number;
  citations: AgentCitation[];
  materials: AgentMaterial[];
  sent: {
    memoryIds: string[];
    sourceIds: string[];
    skill: string;
    prompt: string;
    instructions?: string;
    agentInstructions?: AgentTask["agentInstructions"];
    memories?: AgentMemory[];
    plan?: string;
  };
  calls: number;
  deliveries?: AgentDelivery[];
}
export interface AgentDelegate {
  id: string;
  name: string;
  kind: "researcher" | "web_researcher";
  assignment: string;
  instructions: string;
  status: "running" | "completed" | "failed" | "interrupted";
  startedAt: number;
  finishedAt?: number;
  model: string;
  answer?: string;
  noEvidence?: boolean;
  error?: string;
  citationIds: number[];
  calls: number;
  spanId?: string;
}
export type AgentChannel = "email" | "whatsapp";
export interface DeliveryTarget {
  channel: AgentChannel;
  recipient: string;
  revision: string;
}
export interface AgentDelivery extends DeliveryTarget {
  from?: string;
  status: "sending" | "accepted" | "failed" | "unknown";
  at: number;
  messageId?: string;
  error?: string;
}
export interface AgentConnections {
  model: {
    mode: "notebook" | "custom";
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
    tested: boolean;
  };
  email: {
    smtpHost: string;
    smtpPort: number;
    smtpSecurity: "tls" | "starttls";
    smtpUser: string;
    from: string;
    recipient: string;
    hasPassword: boolean;
    revision: string;
  };
  whatsapp: {
    phoneNumberId: string;
    recipient: string;
    apiVersion: string;
    templateName: string;
    language: string;
    hasApiKey: boolean;
    revision: string;
  };
}
export interface RuntimeReceipt {
  at: number;
  endpoint: string;
  model: string;
  responseId: string;
  method: "connection test" | "agent";
}
export interface AgentState {
  version: 1;
  autonomousToolsVersion?: 1;
  memories: AgentMemory[];
  skills: AgentSkill[];
  sources: SharedSource[];
  tasks: AgentTask[];
  runs: AgentRun[];
  plans: { notebookId: string; text: string; updatedAt: number }[];
  receipts: RuntimeReceipt[];
  files?: AgentFile[];
}
