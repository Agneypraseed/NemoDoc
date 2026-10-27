import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Check,
  ChevronRight,
  Download,
  FileText,
  Globe2,
  LoaderCircle,
  Network,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { apiJSON } from "../lib/api";
import { download } from "../lib/storage";
import { readCompleteTrace } from "../lib/trace-export";
import {
  buildAgentFeed,
  feedStageLabels,
  type FeedAction,
  type FeedAgent,
} from "../lib/agent-feed";
import type { AgentRun } from "../agent-types";
import type { TraceDetail, TraceEvent, TraceEventPage } from "../trace-types";
import "./agent-activity-feed.css";

const time = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
const statusLabels = {
  running: "Working",
  completed: "Completed",
  failed: "Failed",
  rejected: "Not allowed",
  interrupted: "Interrupted",
};

export function AgentActivityFeed({
  notebookId,
  traceId,
  run,
  active,
  showExport = true,
}: {
  notebookId: string;
  traceId?: string;
  run?: AgentRun;
  active?: boolean;
  showExport?: boolean;
}) {
  const [detail, setDetail] = useState<TraceDetail>();
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!traceId);
  const [exporting, setExporting] = useState(false);
  const [revision, setRevision] = useState(0);
  const activeRef = useRef(
    active ?? (run ? run.status === "running" : undefined),
  );
  activeRef.current = active ?? (run ? run.status === "running" : undefined);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor = 0;
    const saved = new Map<string, TraceEvent>();
    setDetail(undefined);
    setEvents([]);
    setError("");
    setLoading(!!traceId);
    if (!traceId) return () => controller.abort();
    const root = `/api/agent/workspace/${encodeURIComponent(notebookId)}/traces/${encodeURIComponent(traceId)}`;
    const update = async () => {
      let poll = activeRef.current ?? true;
      try {
        const snapshot = await apiJSON<TraceDetail>(
          root,
          undefined,
          controller.signal,
        );
        if (snapshot.notebookId !== notebookId || snapshot.traceId !== traceId)
          throw new Error("The activity log does not belong to this notebook.");
        if (controller.signal.aborted) return;
        setDetail(snapshot);
        poll =
          activeRef.current === true ||
          ["running", "queued"].includes(snapshot.status);
        for (;;) {
          const page = await apiJSON<TraceEventPage>(
            `${root}/events?after=${cursor}&limit=200`,
            undefined,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          for (const event of page.events) {
            if (event.notebookId !== notebookId || event.traceId !== traceId)
              throw new Error(
                "An activity event does not belong to this notebook.",
              );
            saved.set(event.eventId, event);
          }
          if (page.hasMore && page.nextCursor <= cursor)
            throw new Error(
              "The activity log could not advance. Try refreshing it.",
            );
          cursor = Math.max(cursor, page.nextCursor);
          setEvents([...saved.values()]);
          if (!page.hasMore) break;
          if (saved.size >= 50000)
            throw new Error(
              "This run has a very large log. Download the activity log to inspect its remaining events.",
            );
        }
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (poll) timer = setTimeout(() => void update(), 2000);
        }
      }
    };
    void update();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [notebookId, traceId, revision]);

  const currentDetail =
    detail?.notebookId === notebookId && detail.traceId === traceId
      ? detail
      : undefined;
  const currentRun = run?.notebookId === notebookId ? run : undefined;
  const groups = useMemo(
    () =>
      buildAgentFeed(
        currentDetail,
        events.filter(
          (event) =>
            event.notebookId === notebookId && event.traceId === traceId,
        ),
        currentRun,
      ),
    [currentDetail, events, currentRun, notebookId, traceId],
  );
  const running =
    active === true ||
    currentRun?.status === "running" ||
    currentDetail?.status === "running" ||
    currentDetail?.status === "queued";
  const exportTrace = async () => {
    if (!traceId) return;
    setExporting(true);
    try {
      const result = await readCompleteTrace(notebookId, traceId);
      download(
        new Blob([JSON.stringify(result, null, 2)], {
          type: "application/json",
        }),
        `agent-trace-${traceId}.json`,
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <section
      className="agent-activity-feed"
      aria-label="Agent work timeline"
      aria-busy={loading}
    >
      <header className="agent-feed-heading">
        <h4>Activity</h4>
        <div>
          {running && (
            <span className="agent-feed-live">
              <LoaderCircle size={13} /> Working
            </span>
          )}
          {traceId && showExport && (
            <button
              type="button"
              className="text-button"
              disabled={exporting}
              onClick={() => void exportTrace()}
            >
              <Download size={14} />{" "}
              {exporting ? "Exporting…" : "Download trace"}
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className="agent-feed-error" role="alert">
          Could not refresh activity. {error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {loading && !events.length && !run?.steps.length ? (
        <p className="agent-feed-note" role="status">
          Loading saved activity…
        </p>
      ) : (
        <ol className="agent-feed-agents">
          {groups.map((group) => (
            <AgentGroup key={group.id} group={group} />
          ))}
        </ol>
      )}
      {currentDetail && (
        <p className="agent-feed-persistence">
          {currentDetail.persistence === "persisted"
            ? "Trace saved to this notebook"
            : "Trace saved locally · database sync unavailable"}
        </p>
      )}
      {!traceId && !!run?.steps.length && (
        <p className="agent-feed-persistence">
          This older run has saved action history but no detailed trace.
        </p>
      )}
    </section>
  );
}

function AgentGroup({ group }: { group: FeedAgent }) {
  const Icon =
    group.kind === "web_researcher"
      ? Globe2
      : group.id === "assistant"
        ? Sparkles
        : FileText;
  const completed = group.actions.filter(
    (action) => action.status === "completed",
  ).length;
  return (
    <li className="agent-feed-agent" data-agent-kind={group.kind}>
      <details open>
        <summary>
          <ChevronRight className="agent-feed-chevron" size={14} />
          <Icon size={18} className="agent-feed-agent-icon" />
          <span className="agent-feed-agent-name">{group.name}</span>
          <span className={`agent-feed-state is-${group.status}`}>
            {statusLabels[group.status]}
          </span>
        </summary>
        <div className="agent-feed-agent-content">
          {group.assignment && (
            <p className="agent-feed-assignment">{group.assignment}</p>
          )}
          {group.status === "running" && (
            <p className="agent-feed-note" role="status">
              {feedStageLabels[group.stage ?? ""] ??
                "Working on the assignment"}
            </p>
          )}
          {group.actions.length ? (
            <ol className="agent-feed-actions">
              {group.actions.map((action) => (
                <ActionRow key={action.id} action={action} />
              ))}
            </ol>
          ) : (
            group.status !== "running" && (
              <p className="agent-feed-note">No tool actions were recorded.</p>
            )
          )}
          {group.status !== "running" && group.actions.length > 0 && (
            <p className="agent-feed-note">
              {completed} completed action{completed === 1 ? "" : "s"}
              {group.model ? ` · ${group.model}` : ""}
            </p>
          )}
          {group.error && <p className="agent-feed-error">{group.error}</p>}
          {group.status === "completed" && group.findings && (
            <details className="agent-feed-findings">
              <summary>
                <ChevronRight className="agent-feed-chevron" size={13} />{" "}
                {group.noEvidence ? "Research outcome" : "Findings"}
              </summary>
              <div className="agent-feed-findings-text">
                <ReactMarkdown
                  skipHtml
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ children }) => <span>{children}</span>,
                    img: ({ alt }) => <span>{alt || "Image omitted"}</span>,
                  }}
                >
                  {group.findings}
                </ReactMarkdown>
              </div>
            </details>
          )}
        </div>
      </details>
    </li>
  );
}

function ActionRow({ action }: { action: FeedAction }) {
  const Icon =
    action.status === "failed" || action.status === "rejected"
      ? TriangleAlert
      : action.status === "running"
        ? LoaderCircle
        : action.tool === "delegate_agents"
          ? Network
          : action.tool === "search_web"
            ? Search
            : action.tool.includes("web")
              ? Globe2
              : action.tool.includes("read") || action.tool.includes("source")
                ? FileText
                : Check;
  return (
    <li
      className={`agent-feed-action is-${action.status}`}
      data-action={action.tool}
    >
      <details open={action.status === "running"}>
        <summary>
          <ChevronRight className="agent-feed-chevron" size={12} />
          <Icon
            size={15}
            className={action.status === "running" ? "agent-feed-spinner" : ""}
          />
          <span>{action.label}</span>
          {(action.status === "failed" ||
            action.status === "rejected" ||
            action.status === "interrupted") && (
            <span className="agent-feed-action-status">
              {statusLabels[action.status]}
            </span>
          )}
          <time dateTime={new Date(action.at).toISOString()}>
            {time(action.at)}
          </time>
        </summary>
        <div className="agent-feed-action-detail">
          {action.query && (
            <p className="agent-feed-query">
              <span>Query</span> {action.query}
            </p>
          )}
          {action.url && (
            <a href={action.url} target="_blank" rel="noreferrer">
              {action.url}
            </a>
          )}
          {action.summary && <p>{action.summary}</p>}
          {action.sources.some((source) => source.candidate) && (
            <p className="agent-feed-note">
              Search results · pages must be read before citing them
            </p>
          )}
          {!!action.sources.length && (
            <ul className="agent-feed-sources">
              {action.sources.map((source, index) => (
                <li key={`${source.url ?? source.title}:${index}`}>
                  {source.citationId && (
                    <span className="agent-feed-citation">
                      [{source.citationId}]
                    </span>
                  )}
                  <div>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.title}
                      </a>
                    ) : (
                      <span>{source.title}</span>
                    )}
                    {source.excerpt && (
                      <details>
                        <summary>
                          {source.candidate
                            ? "Search excerpt"
                            : "Retrieved excerpt"}
                        </summary>
                        <p>{source.excerpt}</p>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}
