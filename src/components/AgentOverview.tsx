import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Server,
  WifiOff,
  Settings2,
  Search,
  Pause,
  Play,
} from "lucide-react";
import { AgentWorkScene } from "./AgentWorkScene";
import { apiJSON } from "../lib/api";
import type {
  AgentActivityStatus,
  AgentDashboard,
} from "../agent-monitor-types";

import {
  activityLabels as labels,
  currentActivity,
  filterActivity,
  isActivityFilter,
  isNotebookActivity,
  type ActivityFilter,
} from "../lib/agent-activity";

const date = (value?: number) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not reported";
function Status({ value }: { value: AgentActivityStatus }) {
  return (
    <span className={`agent-monitor-status is-${value}`}>
      <span aria-hidden="true" />
      {labels[value]}
    </span>
  );
}
export function AgentOverview({
  notebookId,
  onConnections,
  onTasks,
  onConfigure,
}: {
  notebookId: string;
  onConnections: () => void;
  onTasks: () => void;
  onConfigure: (agentId?: string) => void;
}) {
  const [dashboard, setDashboard] = useState<AgentDashboard>();
  const [error, setError] = useState("");
  const [motion, setMotion] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"notebook" | "runtime">("notebook");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ActivityFilter>("all");
  const activityHeading = useRef<HTMLHeadingElement>(null);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const update = async () => {
      if (pending || controller.signal.aborted || document.hidden) return;
      pending = true;
      setBusy(true);
      try {
        const value = await apiJSON<AgentDashboard>(
          `/api/agent/overview?notebookId=${encodeURIComponent(notebookId)}`,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setDashboard(value);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        pending = false;
        if (!controller.signal.aborted) setBusy(false);
      }
    };
    refresh.current = () => {
      void update();
    };
    void update();
    const timer = setInterval(() => {
      void update();
    }, 5000);
    document.addEventListener("visibilitychange", refresh.current);
    return () => {
      clearInterval(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", refresh.current);
    };
  }, [notebookId]);
  const runtime = dashboard?.runtime;
  const notebook = dashboard?.notebookActivity || [];
  const runtimeRows = runtime?.activity || [];
  const working = runtimeRows.filter((row) => row.status === "running").length;
  const waiting = runtimeRows.filter((row) => row.status === "waiting").length;
  const approvals = notebook.filter((row) => row.pendingApproval).length;
  const sourceRows = scope === "notebook" ? notebook : runtimeRows;
  const rows = filterActivity(sourceRows, {
    agentId: selected,
    status: statusFilter,
    query,
  });
  const filtered = !!selected || statusFilter !== "all" || !!query.trim();
  const focusActivity = () => {
    activityHeading.current?.scrollIntoView({ block: "start" });
    activityHeading.current?.focus({ preventScroll: true });
  };
  const showSessions = (status: ActivityFilter = "all", agentId = "") => {
    setSelected(agentId);
    setScope("runtime");
    setStatusFilter(status);
    setQuery("");
    focusActivity();
  };
  const selectAgent = (id: string) => showSessions("all", id);

  return (
    <section className="agent-overview" aria-label="Agent overview">
      <div className="agent-section-title">
        <div>
          <h3>
            <Activity size={16} />
            Agent overview
          </h3>
          <p className="agent-monitor-caption">
            Your agents, their work, and what needs your attention.
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => onConfigure()}
          >
            <Settings2 size={13} />
            Configure roles & models
          </button>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => refresh.current()}
          aria-label="Refresh agents"
        >
          <RefreshCw size={14} className={busy ? "agent-monitor-spin" : ""} />
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}{" "}
          {dashboard
            ? "Showing the last received snapshot; activity may have changed."
            : "Agent status could not be loaded."}
        </p>
      )}
      {!dashboard && !error && (
        <p role="status" className="agent-fine">
          Loading your agents…
        </p>
      )}
      {dashboard && (
        <>
          <div
            className={`agent-runtime-banner ${runtime?.status === "connected" && !error ? "is-connected" : ""}`}
          >
            {runtime?.status === "connected" && !error ? (
              <Server size={18} />
            ) : (
              <WifiOff size={18} />
            )}
            <div>
              <strong>
                {error
                  ? "Status update interrupted"
                  : runtime?.status === "connected"
                    ? "NemoClaw connected"
                    : runtime?.status === "partial"
                      ? "Limited runtime visibility"
                      : "Connect your NemoClaw runtime"}
              </strong>
              <p>{runtime?.message}</p>
              {runtime?.sandbox && <span>Sandbox: {runtime.sandbox} · </span>}
              <span>Checked {date(runtime?.checkedAt)}</span>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={onConnections}
            >
              Connections
              <ArrowRight size={13} />
            </button>
          </div>
          <div className="agent-monitor-metrics" aria-label="Agent counts">
            <button
              type="button"
              onClick={() => showSessions()}
              aria-label="Show all agent sessions"
            >
              <strong>{runtime?.agents.length ?? 0}</strong>
              <span>Runtime agents</span>
            </button>
            <button
              type="button"
              disabled={!!error || runtime?.status !== "connected"}
              onClick={() => showSessions("running")}
              aria-label="Show working sessions"
            >
              <strong>
                {error || runtime?.status !== "connected" ? "—" : working}
              </strong>
              <span>Working sessions</span>
            </button>
            <button
              type="button"
              disabled={!!error || runtime?.status !== "connected"}
              onClick={() => showSessions("waiting")}
              aria-label="Show sessions needing input"
            >
              <strong>
                {error || runtime?.status !== "connected" ? "—" : waiting}
              </strong>
              <span>Need your input</span>
            </button>
            <button
              type="button"
              onClick={onTasks}
              aria-label="Review notebook approvals"
            >
              <strong>{dashboard.notebookError ? "—" : approvals}</strong>
              <span>Notebook approvals</span>
            </button>
          </div>
          {!!runtime?.agents.length && (
            <>
              <div className="agent-section-title">
                <h3>Runtime agents</h3>
                <button
                  type="button"
                  className="text-button"
                  aria-label="Agent animations"
                  aria-pressed={motion}
                  onClick={() => setMotion((value) => !value)}
                >
                  {motion ? <Pause size={13} /> : <Play size={13} />}
                  {motion ? "Pause animations" : "Play animations"}
                </button>
                <span className="agent-monitor-caption">
                  Across {runtime.sandbox || "your gateway"}
                </span>
              </div>
              <div className="agent-monitor-grid">
                {runtime.agents.map((agent) => {
                  const sessions = runtimeRows.filter(
                    (row) => row.agentId === agent.id,
                  );
                  const latest = currentActivity(sessions);
                  const status =
                    error || runtime.status !== "connected"
                      ? "unknown"
                      : latest?.status || "unknown";
                  return (
                    <article
                      key={agent.id}
                      className={`agent-monitor-card ${selected === agent.id ? "is-selected" : ""}`}
                      aria-label={`${agent.name} agent`}
                    >
                      <div className="agent-monitor-card-heading">
                        <span
                          className="agent-monitor-avatar"
                          aria-hidden="true"
                        >
                          {agent.emoji || <Bot size={20} />}
                        </span>
                        <div>
                          <h4>{agent.name}</h4>
                          <span className="agent-monitor-caption">
                            {agent.id}
                            {agent.isDefault ? " · Default" : ""}
                          </span>
                        </div>
                        <Status value={status} />
                      </div>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onConfigure(agent.id)}
                        aria-label={`Configure ${agent.name}`}
                      >
                        <Settings2 size={13} />
                        Agent settings
                      </button>
                      <p className="agent-monitor-model">
                        {agent.model || "Model inherited from runtime"}
                      </p>
                      <AgentWorkScene
                        name={agent.name}
                        status={status}
                        motion={motion}
                      />
                      <p className="agent-monitor-current">
                        {error
                          ? "Refresh to check current activity."
                          : latest?.summary ||
                            "No session activity reported for this agent."}
                      </p>
                      <div className="agent-monitor-card-footer">
                        <span>
                          {sessions.length} recent session
                          {sessions.length === 1 ? "" : "s"}
                        </span>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => selectAgent(agent.id)}
                          aria-label={`View ${agent.name} activity`}
                        >
                          View activity
                          <ArrowRight size={13} />
                        </button>
                      </div>
                      {dashboard.connection.mode === "openclaw" &&
                        dashboard.connection.model ===
                          `openclaw/${agent.id}` && (
                          <span className="agent-monitor-target">
                            <CheckCircle2 size={12} />
                            Matches NemoDoc’s selected target
                          </span>
                        )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {!runtime?.agents.length && (
            <div className="agent-empty">
              <Bot size={25} />
              <h4>No runtime agents to display yet</h4>
              <p>
                Your configured agents will appear here when NemoClaw is
                connected. Notebook tasks and workflow history remain available
                below.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={onConnections}
              >
                Set up agent connection
              </button>
              <details className="agent-monitor-setup">
                <summary>Show runtime monitoring setup</summary>
                <p>
                  Run NemoDoc on the NemoClaw host with{" "}
                  <code>NEMODOC_NEMOCLAW_SANDBOX=nemodoc</code> and the NemoClaw
                  CLI available. For a remote gateway, Connections can show its
                  agent inventory; live session monitoring requires access from
                  the runtime host.
                </p>
              </details>
            </div>
          )}
          <div className="agent-section-title">
            <h3 ref={activityHeading} tabIndex={-1}>
              <Clock3 size={16} />
              Activity
            </h3>
            <button type="button" className="text-button" onClick={onTasks}>
              Tasks & approvals
              <ArrowRight size={13} />
            </button>
          </div>
          <div className="agent-monitor-filters" aria-label="Activity scope">
            <button
              type="button"
              aria-pressed={scope === "notebook"}
              onClick={() => {
                setScope("notebook");
                setSelected("");
                setStatusFilter("all");
                setQuery("");
              }}
            >
              This notebook
            </button>
            <button
              type="button"
              aria-pressed={scope === "runtime"}
              onClick={() => {
                setScope("runtime");
                setSelected("");
                setStatusFilter("all");
                setQuery("");
              }}
            >
              Runtime sessions
            </button>
            {selected && (
              <button type="button" onClick={() => setSelected("")}>
                All agents ×
              </button>
            )}
          </div>
          <div className="agent-activity-toolbar">
            <label className="agent-activity-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search activity"
                placeholder="Find work by title, agent, or model…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Activity status"
              value={statusFilter}
              onChange={(event) => {
                if (isActivityFilter(event.target.value))
                  setStatusFilter(event.target.value);
              }}
            >
              <option value="all">All statuses</option>
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {filtered && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setSelected("");
                  setStatusFilter("all");
                  setQuery("");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <p className="agent-monitor-caption" role="status">
            {rows.length} of {sourceRows.length} activities
            {selected ? ` · ${selected}` : ""}
          </p>
          {scope === "notebook" && (
            <p className="agent-monitor-caption">
              {dashboard.connection.model} ·{" "}
              {dashboard.connection.mode === "openclaw"
                ? "OpenClaw agent"
                : "NemoDoc worker"}
              . Results and tool steps from this notebook.
            </p>
          )}
          {scope === "notebook" && dashboard.notebookError && (
            <p role="alert" className="form-error">
              {dashboard.notebookError}
            </p>
          )}
          {scope === "runtime" && (
            <p className="agent-monitor-caption">
              {selected
                ? `Sessions for ${selected}`
                : "Sessions across this sandbox"}
              . Runtime-reported status; no conversation transcripts are loaded.
              {runtime?.hasMore
                ? " Showing the most recent 100 sessions; older sessions may be omitted."
                : ""}
            </p>
          )}
          {!rows.length && (
            <p className="agent-fine">
              {filtered && sourceRows.length
                ? "No activity matches these filters. Try another search or clear filters."
                : scope === "runtime"
                  ? runtime?.status === "connected"
                    ? "No sessions reported yet."
                    : "Live session activity is unavailable until runtime monitoring is connected."
                  : "No work recorded in this notebook yet. Open Tasks to start a study or research workflow."}
            </p>
          )}
          <ol
            className="agent-monitor-feed"
            aria-label={
              scope === "notebook"
                ? "Notebook agent activity"
                : "Runtime agent activity"
            }
          >
            {rows.map((row) => {
              const local = isNotebookActivity(row) ? row : undefined;
              return (
                <li key={`${local?.kind || "session"}-${row.id}`}>
                  <div className="agent-monitor-feed-heading">
                    <div>
                      <h4>{row.title}</h4>
                      <span className="agent-monitor-caption">
                        {row.agentId} · {date(row.updatedAt)}
                      </span>
                    </div>
                    <Status
                      value={
                        error && scope === "runtime" ? "unknown" : row.status
                      }
                    />
                  </div>
                  <p>{row.summary}</p>
                  {local?.pendingApproval && (
                    <button
                      type="button"
                      className="agent-monitor-approval"
                      onClick={onTasks}
                    >
                      Review proposed actions
                      <ArrowRight size={13} />
                    </button>
                  )}
                  {!!local?.steps?.length && (
                    <details>
                      <summary>
                        View {local.steps.length} recent tool step
                        {local.steps.length === 1 ? "" : "s"}
                      </summary>
                      <ul>
                        {local.steps.map((step, i) => (
                          <li key={`${step.at}-${i}`}>
                            <strong>{step.tool}</strong>
                            <p>{step.summary}</p>
                            <time>{date(step.at)}</time>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {local?.delivery && (
                    <p className="agent-monitor-caption">
                      Delivery: {local.delivery}
                    </p>
                  )}
                  {row.tokens !== undefined && (
                    <p className="agent-monitor-caption">
                      {row.tokens.toLocaleString()} reported tokens
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
