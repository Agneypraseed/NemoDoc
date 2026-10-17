export type AgentActivityStatus =
  | "running"
  | "waiting"
  | "queued"
  | "completed"
  | "failed"
  | "interrupted"
  | "unknown";
export interface RuntimeActivity {
  id: string;
  agentId: string;
  title: string;
  status: AgentActivityStatus;
  summary: string;
  updatedAt?: number;
  model?: string;
  tokens?: number;
}
export interface RuntimeAgent {
  id: string;
  name: string;
  emoji?: string;
  model?: string;
  isDefault: boolean;
}
export interface AgentRuntimeSnapshot {
  status: "connected" | "partial" | "unavailable" | "not_configured";
  source: "nemoclaw" | "gateway" | "none";
  sandbox?: string;
  checkedAt: number;
  message: string;
  agents: RuntimeAgent[];
  activity: RuntimeActivity[];
  hasMore: boolean;
}
export interface NotebookAgentActivity extends RuntimeActivity {
  kind: "task" | "workflow";
  steps: { tool: string; summary: string; at: number }[];
  pendingApproval: boolean;
  delivery?: string;
}
export interface AgentDashboard {
  runtime: AgentRuntimeSnapshot;
  connection: { mode: string; model: string; tested: boolean };
  notebookActivity: NotebookAgentActivity[];
  notebookError?: string;
}
