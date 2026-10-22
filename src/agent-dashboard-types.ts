import type { TracePersistence, TraceStatus } from "./trace-types";

export interface DashboardModelUsage {
  key: string;
  model: string;
  provider: string;
  calls: number;
  responses: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  usageReports: number;
}

export interface DashboardTrace {
  traceId: string;
  name: string;
  request?: string;
  status: TraceStatus;
  createdAt: number;
  durationMs?: number;
  kind: "plan" | "research" | "task";
  models: DashboardModelUsage[];
  toolCalls: number;
  citationChecksPassed: number;
  citationChecksFailed: number;
}

export interface AgentDashboardData {
  notebookId: string;
  since: number;
  until: number;
  generatedAt: number;
  persistence: TracePersistence;
  truncated: boolean;
  traces: DashboardTrace[];
}

/** User-entered USD rates, not provider billing data. */
export type DashboardPrices = Record<
  string,
  {
    inputPerMillion: number;
    outputPerMillion: number;
  }
>;
