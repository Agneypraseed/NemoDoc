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
export interface NotebookAgentActivity extends RuntimeActivity {
  kind: "task" | "workflow";
  steps: { tool: string; summary: string; at: number }[];
  pendingApproval: boolean;
  delivery?: string;
}
export interface AgentDashboard {
  connection: { mode: string; model: string; tested: boolean };
  notebookActivity: NotebookAgentActivity[];
  notebookError?: string;
}
