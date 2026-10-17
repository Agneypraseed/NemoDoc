import type {
  AgentActivityStatus,
  RuntimeActivity,
  NotebookAgentActivity,
} from "../agent-monitor-types";

export const activityLabels = {
  running: "Working",
  waiting: "Needs you",
  queued: "Queued",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted",
  unknown: "Status unknown",
} satisfies Record<AgentActivityStatus, string>;
export type ActivityFilter = "all" | AgentActivityStatus;
export function isActivityFilter(value: string): value is ActivityFilter {
  return value === "all" || Object.hasOwn(activityLabels, value);
}
export function isNotebookActivity(
  row: RuntimeActivity,
): row is NotebookAgentActivity {
  return "kind" in row && "steps" in row;
}
export function filterActivity<T extends RuntimeActivity>(
  rows: readonly T[],
  filter: { agentId: string; status: ActivityFilter; query: string },
): T[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return rows
    .filter(
      (row) =>
        (!filter.agentId || row.agentId === filter.agentId) &&
        (filter.status === "all" || row.status === filter.status) &&
        (!query ||
          [row.title, row.summary, row.agentId, row.model || ""].some((value) =>
            value.toLocaleLowerCase().includes(query),
          )),
    )
    .sort(
      (a, b) =>
        (b.updatedAt || 0) - (a.updatedAt || 0) || a.id.localeCompare(b.id),
    );
}
const priority: Record<AgentActivityStatus, number> = {
  running: 3,
  waiting: 2,
  queued: 1,
  completed: 0,
  failed: 0,
  interrupted: 0,
  unknown: 0,
};
export function currentActivity(
  rows: readonly RuntimeActivity[],
): RuntimeActivity | undefined {
  return rows.reduce<RuntimeActivity | undefined>((current, row) => {
    if (
      !current ||
      priority[row.status] > priority[current.status] ||
      (priority[row.status] === priority[current.status] &&
        (row.updatedAt || 0) > (current.updatedAt || 0))
    )
      return row;
    return current;
  }, undefined);
}
