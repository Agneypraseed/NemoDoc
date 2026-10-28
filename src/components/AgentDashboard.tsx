import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, RefreshCw, X, Download } from "lucide-react";
import { apiJSON } from "../lib/api";
import { download } from "../lib/storage";
import {
  estimatedCost,
  readDashboardPrices,
  summarizeDashboard,
} from "../lib/agent-dashboard";
import { readCompleteTrace } from "../lib/trace-export";
import { AgentActivityFeed } from "./AgentActivityFeed";
import type {
  AgentDashboardData,
  DashboardModelUsage,
  DashboardPrices,
  DashboardTrace,
} from "../agent-dashboard-types";
import type { TraceDetail, TraceEventPage } from "../trace-types";
import "./agent-dashboard.css";

const day = 86400000;
const number = (value: number) => value.toLocaleString();
const compact = (value: number) =>
  Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
const priceKey = "nemodoc.agent-dashboard-prices.v1";
const outcomes = [
  "completed",
  "failed",
  "interrupted",
  "running",
  "queued",
] as const;
const label = (text: string) => text[0].toUpperCase() + text.slice(1);
const duration = (ms?: number) =>
  ms === undefined
    ? "—"
    : ms < 1000
      ? "<1s"
      : ms < 60000
        ? `${Math.round(ms / 1000)}s`
        : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;

export function AgentDashboard({
  notebookId,
  onResearch,
  renderResult,
}: {
  notebookId: string;
  onResearch: (traceId?: string) => void;
  renderResult?: (traceId: string) => ReactNode;
}) {
  const [data, setData] = useState<AgentDashboardData>();
  const [days, setDays] = useState(30),
    [status, setStatus] = useState(""),
    [model, setModel] = useState("");
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<DashboardTrace>();
  const [pricing, setPricing] = useState(false);
  const [prices, setPrices] = useState<DashboardPrices>(() => {
    try {
      return readDashboardPrices(localStorage.getItem(priceKey));
    } catch {
      return {};
    }
  });
  const [visible, setVisible] = useState(20);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError("");
    setBusy(true);
    const update = async () => {
      try {
        const until = Date.now();
        const result = await apiJSON<AgentDashboardData>(
          `/api/agent/workspace/${encodeURIComponent(notebookId)}/dashboard?since=${until - days * day}&until=${until}`,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    };
    void update();
    const timer = setInterval(() => {
      if (!document.hidden) void update();
    }, 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [notebookId, days, revision]);
  useEffect(() => {
    setSelected(undefined);
    setModel("");
    setStatus("");
  }, [notebookId]);
  useEffect(() => setVisible(20), [days, status, model]);
  const allModels = useMemo(
    () => summarizeDashboard(data?.traces ?? []).models,
    [data],
  );
  const traces = (data?.traces ?? []).filter(
    (t) =>
      (!status || t.status === status) &&
      (!model || t.models.some((m) => m.key === model)),
  );
  const summary = summarizeDashboard(traces, model);
  return (
    <section className="agent-dashboard" aria-label="Agent dashboard">
      <header className="dashboard-heading">
        <div>
          <h2>Agent dashboard</h2>
          <p>Activity in this notebook</p>
        </div>
        <div className="dashboard-actions">
          <button className="primary-button" onClick={() => onResearch()}>
            New research
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => setRevision((r) => r + 1)}
          >
            <RefreshCw
              size={15}
              className={busy ? "dashboard-refreshing" : ""}
            />
            Refresh
          </button>
        </div>
      </header>
      <div className="dashboard-filters">
        <label className="field-label">
          Period
          <select
            aria-label="Period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </label>
        <label className="field-label">
          Status
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All outcomes</option>
            {outcomes.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Model
          <select
            aria-label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">All models</option>
            {allModels.map((m) => (
              <option key={m.key} value={m.key}>
                {m.model} · {m.provider}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          Could not refresh activity. {error}{" "}
          {data && "Showing the last recorded snapshot."}
        </p>
      )}
      {!data && !error && (
        <div className="dashboard-loading" role="status">
          Loading recorded activity…
        </div>
      )}
      {data && (
        <>
          <dl className="dashboard-stats" aria-label="Activity totals">
            <div>
              <dt>Runs & plans</dt>
              <dd>{number(traces.length)}</dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd className="dashboard-success">{number(summary.completed)}</dd>
            </div>
            <div>
              <dt>Model calls</dt>
              <dd>{number(summary.calls)}</dd>
            </div>
            <div>
              <dt>Recorded tokens</dt>
              <dd>{summary.usageReports ? compact(summary.tokens) : "—"}</dd>
            </div>
          </dl>
          <p className="dashboard-caption">
            Includes planning and scheduled tasks. Tokens reported for{" "}
            {summary.usageReports} of {summary.calls} calls.{" "}
            {data.truncated &&
              "Partial results: narrow the period to inspect a smaller set."}
          </p>
          <div className="dashboard-chart-grid">
            <section className="dashboard-surface">
              <h3>Activity over time</h3>
              <ActivityChart
                traces={traces}
                since={data.since}
                until={data.until}
              />
            </section>
            <section className="dashboard-surface">
              <h3>Run outcomes</h3>
              <div className="dashboard-outcomes">
                {outcomes.map((outcome) => {
                  const count = traces.filter(
                    (t) => t.status === outcome,
                  ).length;
                  return (
                    <div key={outcome}>
                      <span>{label(outcome)}</span>
                      <div className="dashboard-bar-track">
                        <div
                          className={`dashboard-bar is-${outcome}`}
                          style={{
                            transform: `scaleX(${count / Math.max(1, traces.length)})`,
                          }}
                        />
                      </div>
                      <strong>{number(count)}</strong>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
          <section className="dashboard-surface">
            <div className="dashboard-section-heading">
              <h3>Model usage</h3>
              <button
                className="text-button"
                aria-expanded={pricing}
                onClick={() => setPricing((p) => !p)}
              >
                Pricing settings
              </button>
            </div>
            {pricing && (
              <Pricing
                models={allModels}
                prices={prices}
                onSave={(next) => {
                  try {
                    localStorage.setItem(priceKey, JSON.stringify(next));
                    setPrices(next);
                    setPricing(false);
                  } catch {
                    setError("Pricing could not be saved in this browser.");
                  }
                }}
              />
            )}
            {summary.models.length ? (
              <div className="dashboard-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Calls</th>
                      <th>Input tokens</th>
                      <th>Output tokens</th>
                      <th>Estimated cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.models.map((m) => {
                      const cost = estimatedCost(m, prices);
                      return (
                        <tr key={m.key}>
                          <th scope="row">
                            {m.model}
                            <small>{m.provider}</small>
                          </th>
                          <td>
                            {number(m.calls)}
                            {m.failed > 0 && (
                              <small>{m.failed} failed responses</small>
                            )}
                          </td>
                          <td>
                            {m.usageReports ? number(m.promptTokens) : "—"}
                          </td>
                          <td>
                            {m.usageReports ? number(m.completionTokens) : "—"}
                          </td>
                          <td>
                            {!prices[m.key]
                              ? "Not configured"
                              : cost === null
                                ? "Incomplete usage"
                                : cost.toLocaleString(undefined, {
                                    style: "currency",
                                    currency: "USD",
                                    minimumFractionDigits: 4,
                                    maximumFractionDigits: 6,
                                  })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dashboard-empty">
                No model calls in this selection.
              </p>
            )}
            <p className="dashboard-caption">
              Recorded token totals may be partial. Costs use your saved rates
              and complete usage reports; they are estimates, not invoices.
            </p>
          </section>
          <section className="dashboard-surface">
            <h3>Recent work</h3>
            {traces.length ? (
              <>
                <div className="dashboard-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Status</th>
                        <th>Started</th>
                        <th>Duration</th>
                        <th>
                          <span className="sr-only">Action</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {traces.slice(0, visible).map((t) => (
                        <tr
                          key={t.traceId}
                          aria-selected={selected?.traceId === t.traceId}
                        >
                          <th scope="row">
                            {t.request || t.name}
                            <small>{label(t.kind)}</small>
                          </th>
                          <td>
                            <span className={`dashboard-status is-${t.status}`}>
                              <i aria-hidden="true" />
                              {label(t.status)}
                            </span>
                          </td>
                          <td>
                            <time
                              dateTime={new Date(t.createdAt).toISOString()}
                            >
                              {new Date(t.createdAt).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </td>
                          <td>{duration(t.durationMs)}</td>
                          <td>
                            <button
                              className="text-button"
                              aria-label={`Inspect ${t.name}`}
                              onClick={() => setSelected(t)}
                            >
                              Inspect
                              <ArrowUpRight size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {visible < traces.length && (
                  <button
                    className="text-button"
                    onClick={() => setVisible((v) => v + 20)}
                  >
                    Show more work
                  </button>
                )}
              </>
            ) : (
              <div className="dashboard-empty">
                <p>
                  {data.traces.length
                    ? "No work matches these filters."
                    : "Your agents’ work will appear here."}
                </p>
                <button
                  className="text-button"
                  onClick={() =>
                    data.traces.length
                      ? (setStatus(""), setModel(""))
                      : onResearch()
                  }
                >
                  {data.traces.length
                    ? "Clear filters"
                    : "Start a research task"}
                </button>
              </div>
            )}
          </section>
          {selected && (
            <>
              {renderResult?.(selected.traceId)}
              <TraceInspection
                key={selected.traceId}
                notebookId={notebookId}
                trace={selected}
                onClose={() => setSelected(undefined)}
                onResearch={onResearch}
              />
            </>
          )}
          <p className="dashboard-caption">
            {data.persistence === "persisted"
              ? "Stored in PostgreSQL"
              : "Stored in the local activity log · PostgreSQL is not available"}{" "}
            · Updated {new Date(data.generatedAt).toLocaleTimeString()}
          </p>
        </>
      )}
    </section>
  );
}

function ActivityChart({
  traces,
  since,
  until,
}: {
  traces: DashboardTrace[];
  since: number;
  until: number;
}) {
  const start = Math.floor(since / day) * day,
    count = Math.floor((until - start) / day) + 1;
  const bins = Array.from({ length: count }, (_, i) => ({
    at: start + i * day,
    count: 0,
  }));
  traces.forEach((t) => {
    const bin = bins[Math.floor((t.createdAt - start) / day)];
    if (bin) bin.count++;
  });
  const max = Math.max(1, ...bins.map((b) => b.count));
  const points = bins
    .map(
      (b, i) =>
        `${32 + (i / Math.max(1, count - 1)) * 588},${155 - (b.count / max) * 126}`,
    )
    .join(" ");
  return (
    <div className="dashboard-chart">
      <svg
        viewBox="0 0 650 200"
        role="img"
        aria-label={`${traces.length} runs and plans over ${count} UTC dates`}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1="32"
              x2="620"
              y1={155 - f * 126}
              y2={155 - f * 126}
              className="dashboard-grid-line"
            />
            <text x="24" y={159 - f * 126} textAnchor="end">
              {Number((max * f).toFixed(1))}
            </text>
          </g>
        ))}
        <polyline points={points} className="dashboard-chart-line" />
        {bins.map(
          (b, i) =>
            b.count > 0 && (
              <circle
                key={b.at}
                cx={32 + (i / Math.max(1, count - 1)) * 588}
                cy={155 - (b.count / max) * 126}
                r="3.5"
              >
                <title>
                  {new Date(b.at).toISOString().slice(0, 10)}: {b.count} runs
                  and plans
                </title>
              </circle>
            ),
        )}
        {[bins[0], bins[Math.floor((count - 1) / 2)], bins[count - 1]].map(
          (b, i) => (
            <text
              key={i}
              x={32 + i * 294}
              y="184"
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
            >
              {new Date(b.at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </text>
          ),
        )}
      </svg>
      <details>
        <summary>Daily activity data (UTC)</summary>
        <ul>
          {bins.map((b) => (
            <li key={b.at}>
              {new Date(b.at).toISOString().slice(0, 10)}: {b.count}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Pricing({
  models,
  prices,
  onSave,
}: {
  models: DashboardModelUsage[];
  prices: DashboardPrices;
  onSave: (prices: DashboardPrices) => void;
}) {
  const [error, setError] = useState("");
  return (
    <form
      className="dashboard-pricing"
      onSubmit={(e) => {
        e.preventDefault();
        const fields = new FormData(e.currentTarget);
        const next = { ...prices };
        for (const [i, m] of models.entries()) {
          const input = String(fields.get(`in-${i}`) ?? "").trim(),
            output = String(fields.get(`out-${i}`) ?? "").trim();
          if (!input && !output) {
            delete next[m.key];
            continue;
          }
          const a = Number(input),
            b = Number(output);
          if (
            !input ||
            !output ||
            ![a, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 1e6)
          ) {
            setError(
              "Enter both non-negative rates, or clear both to remove pricing.",
            );
            return;
          }
          next[m.key] = { inputPerMillion: a, outputPerMillion: b };
        }
        onSave(next);
      }}
    >
      <p>
        USD per million tokens. These rates apply to this browser’s dashboard
        estimates, including historical usage.
      </p>
      {models.map((m, i) => (
        <fieldset key={m.key}>
          <legend>
            {m.model} · {m.provider}
          </legend>
          <label className="field-label">
            Input rate
            <input
              aria-label={`${m.model} input rate`}
              name={`in-${i}`}
              type="number"
              min="0"
              max="1000000"
              step="any"
              defaultValue={prices[m.key]?.inputPerMillion ?? ""}
            />
          </label>
          <label className="field-label">
            Output rate
            <input
              aria-label={`${m.model} output rate`}
              name={`out-${i}`}
              type="number"
              min="0"
              max="1000000"
              step="any"
              defaultValue={prices[m.key]?.outputPerMillion ?? ""}
            />
          </label>
        </fieldset>
      ))}
      {error && <p role="alert">{error}</p>}
      <button className="primary-button" type="submit">
        Save pricing
      </button>
    </form>
  );
}

function TraceInspection({
  notebookId,
  trace,
  onClose,
  onResearch,
}: {
  notebookId: string;
  trace: DashboardTrace;
  onClose: () => void;
  onResearch: (traceId?: string) => void;
}) {
  const [detail, setDetail] = useState<TraceDetail>(),
    [page, setPage] = useState<TraceEventPage>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const root = `/api/agent/workspace/${encodeURIComponent(notebookId)}/traces/${trace.traceId}`;
  useEffect(() => {
    const controller = new AbortController();
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
    void Promise.all([
      apiJSON<TraceDetail>(root, undefined, controller.signal),
      apiJSON<TraceEventPage>(
        `${root}/events?limit=100`,
        undefined,
        controller.signal,
      ),
    ])
      .then(([d, p]) => {
        setDetail(d);
        setPage(p);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [root]);
  return (
    <section
      className="dashboard-surface dashboard-inspection"
      aria-label="Selected activity"
    >
      <div className="dashboard-section-heading">
        <h3 ref={heading} tabIndex={-1}>
          {trace.name}
        </h3>
        <button
          className="icon-button"
          aria-label="Close activity inspection"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p>
        {label(detail?.status ?? trace.status)} ·{" "}
        {duration(detail?.durationMs ?? trace.durationMs)}
      </p>
      {error && <p role="alert">{error}</p>}
      {detail?.error && <p className="form-error">{detail.error}</p>}
      <div className="dashboard-actions">
        <button
          className="secondary-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await readCompleteTrace(notebookId, trace.traceId);
              download(
                new Blob([JSON.stringify(result, null, 2)], {
                  type: "application/json",
                }),
                `agent-trace-${trace.traceId}.json`,
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={15} />
          Download activity log
        </button>
        <button
          className="text-button"
          onClick={() => onResearch(trace.traceId)}
        >
          Open findings & actions
          <ArrowUpRight size={15} />
        </button>
      </div>
      {!detail && !error && <p role="status">Loading activity…</p>}
      <AgentActivityFeed
        notebookId={notebookId}
        traceId={trace.traceId}
        showExport={false}
      />
      <details className="dashboard-technical-trace">
        <summary>Technical trace</summary>
        <div className="dashboard-span-list">
          {detail?.spans.map((span) => (
            <details key={span.spanId}>
              <summary>
                {span.name}
                <span>
                  {label(span.status)} · {duration(span.durationMs)}
                </span>
              </summary>
              <pre>{JSON.stringify(span, null, 2)}</pre>
            </details>
          ))}
        </div>
        {page && (
          <details>
            <summary>
              Recorded events · {page.events.length}
              {page.hasMore ? "+" : ""}
            </summary>
            {page.events.map((event) => (
              <details key={event.eventId}>
                <summary>
                  {event.sequence} · {event.type} ·{" "}
                  {new Date(event.at).toLocaleTimeString()}
                </summary>
                <pre>{JSON.stringify(event.payload, null, 2)}</pre>
              </details>
            ))}
            {page.hasMore && (
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const next = await apiJSON<TraceEventPage>(
                      `${root}/events?after=${page.nextCursor}&limit=100`,
                    );
                    setPage({
                      ...next,
                      events: [...page.events, ...next.events],
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Load more events
              </button>
            )}
          </details>
        )}
      </details>
    </section>
  );
}
