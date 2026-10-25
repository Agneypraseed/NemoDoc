import { useEffect, useState } from "react";
import { Activity, ArrowRight, RefreshCw } from "lucide-react";
import { apiJSON } from "../lib/api";
import type { AgentDashboard } from "../agent-monitor-types";
import {
  activityLabels,
  filterActivity,
  isActivityFilter,
  type ActivityFilter,
} from "../lib/agent-activity";

export function AgentOverview({
  notebookId,
  onConnections,
  onTasks,
}: {
  notebookId: string;
  onConnections: () => void;
  onTasks: () => void;
}) {
  const [dashboard, setDashboard] = useState<AgentDashboard>();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ActivityFilter>("all");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      if (controller.signal.aborted || document.hidden) return;
      setBusy(true);
      try {
        const result = await apiJSON<AgentDashboard>(
          `/api/agent/overview?notebookId=${encodeURIComponent(notebookId)}`,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setDashboard(result);
          setError("");
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    };
    void update();
    const timer = setInterval(() => void update(), 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [notebookId]);
  const rows = filterActivity(dashboard?.notebookActivity ?? [], {
    agentId: "",
    status,
    query,
  });
  return (
    <section className="agent-overview" aria-label="Agent activity">
      <div className="agent-section-title">
        <h2>
          <Activity size={19} /> Agent activity
        </h2>
        <button type="button" className="text-button" onClick={onTasks}>
          Tasks & approvals <ArrowRight size={13} />
        </button>
      </div>
      <p className="agent-fine">
        Model: {dashboard?.connection.model || "Loading…"}
        {dashboard?.connection.tested
          ? " · Tool support tested"
          : " · Test in Connections"}
        <button type="button" className="text-button" onClick={onConnections}>
          Connections
        </button>
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {dashboard?.notebookError && (
        <p role="status">{dashboard.notebookError}</p>
      )}
      <div className="agent-monitor-filters">
        <label>
          Search activity
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              if (isActivityFilter(event.target.value))
                setStatus(event.target.value);
            }}
          >
            <option value="all">All</option>
            {Object.entries(activityLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span role="status">
          <RefreshCw size={13} />{" "}
          {busy ? "Refreshing" : `${rows.length} activities`}
        </span>
      </div>
      {rows.length ? (
        <ol className="agent-monitor-list">
          {rows.map((row) => (
            <li key={row.id} className="agent-monitor-activity">
              <div>
                <strong>{row.title}</strong> · {activityLabels[row.status]}
              </div>
              <p>{row.summary}</p>
              <p className="agent-fine">
                {row.model || "Model unavailable"}
                {row.updatedAt
                  ? ` · ${new Date(row.updatedAt).toLocaleString()}`
                  : ""}
              </p>
              {row.pendingApproval && <p>Approval pending</p>}
              {row.delivery && <p>{row.delivery}</p>}
              {!!row.steps.length && (
                <details>
                  <summary>Steps</summary>
                  <ol>
                    {row.steps.map((step, index) => (
                      <li key={`${index}:${step.at}`}>
                        {step.tool}: {step.summary}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="agent-empty">No activity matches this view.</p>
      )}
    </section>
  );
}
