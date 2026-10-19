export type TraceStatus =
  "queued" | "running" | "completed" | "failed" | "interrupted";

export type TracePersistence = "persisted" | "degraded";

export type ResearchStage =
  | "queued"
  | "retrieving"
  | "awaiting_model_response"
  | "validating"
  | "synthesizing"
  | "completed"
  | "failed"
  | "interrupted";

export interface TraceSummary {
  traceId: string;
  notebookId: string;
  runner: "personal_agent" | "evidence_workflow";
  name: string;
  status: TraceStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
  metadata: Record<string, unknown>;
  persistence: TracePersistence;
}

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  status: "running" | "completed" | "failed" | "interrupted";
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  attempt?: number;
  error?: string;
  attributes: Record<string, unknown>;
}

export interface TraceEvent {
  eventId: string;
  traceId: string;
  sequence: number;
  notebookId: string;
  spanId?: string;
  at: number;
  type: string;
  attempt?: number;
  payload: Record<string, unknown>;
}

export interface TraceDetail extends TraceSummary {
  spans: TraceSpan[];
}

export interface TraceEventPage {
  events: TraceEvent[];
  nextCursor: number;
  hasMore: boolean;
  persistence: TracePersistence;
}

export interface TraceMetrics {
  since: number;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  interruptedRuns: number;
  completionRate: number | null;
  failureRate: number | null;
  interruptionRate: number | null;
  latencyMs: { p50: number | null; p95: number | null };
  modelCalls: number;
  toolCalls: number;
  promptTokens: number | null;
  completionTokens: number | null;
  citationChecks: number;
  citationChecksPassed: number;
  citationChecksFailed: number;
  persistence: TracePersistence;
}
