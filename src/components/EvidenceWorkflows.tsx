import { AgentActivityFeed } from "./AgentActivityFeed";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  Check,
  Circle,
  LoaderCircle,
  ShieldCheck,
  ArrowDownToLine,
} from "lucide-react";
import "../workflows.css";
import { apiJSON } from "../lib/api";
import { citationMarkdown } from "../lib/citations";
import { download } from "../lib/storage";
import { researchReportMarkdown } from "../lib/research-report";
import { readCompleteTrace } from "../lib/trace-export";
import type { SearchNote } from "../lib/search-notes";
import type { Citation, Source, StudyArtifact } from "../types";
import type {
  ActionProposal,
  EvidenceWorkflow,
  ProposalAction,
  WorkflowReport,
  WorkspaceState,
  WorkflowRun,
} from "../workspace-types";
import type { AgentActivityStatus } from "../agent-monitor-types";
import type {
  TraceDetail,
  TraceEvent,
  TraceMetrics,
  TraceSummary,
  TraceEventPage,
} from "../trace-types";
import { activityLabels } from "../lib/agent-activity";
import { ResearchPromptEditor } from "./ResearchPromptEditor";
import {
  DEFAULT_RESEARCH_PROMPTS,
  type ResearchPrompts,
} from "../research-prompt-types";
import { ResearchPlanEditor } from "./ResearchPlanEditor";
import { ResearchInstructions } from "./ResearchInstructions";
import type { ResearchModelCatalog } from "../research-model-types";
import {
  researchPlanSchema,
  researchLimits,
  type ResearchPlan,
} from "../workspace-types";

const root = "/api/agent/workspace";
const sceneStatus = (
  agent: NonNullable<WorkspaceState["runs"][number]["researchTeam"]>[number],
): AgentActivityStatus => {
  if (agent.status === "interrupted") return "interrupted";
  if (agent.status === "failed") return "failed";
  if (agent.status === "completed") return "completed";
  if (agent.stage === "queued") return "queued";
  return "running";
};
const stageLabels: Record<string, string> = {
  queued: "Queued",
  retrieving: "Retrieving approved evidence",
  awaiting_model_response: "Waiting for inference",
  validating: "Validating citations",
  synthesizing: "Reviewer synthesis",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted",
};
const workflowNames = {
  study_revision: "Revision plan",
  research_synthesis: "Research synthesis",
  research_team: "Research team",
} as const;
export function EvidenceWorkflows({
  notebookId,
  title,
  sources,
  notes,
  onCitation,
  onSave,
  onSaveResearch,
  savedResearchRuns,
  onConnections,
  inspectionTraceId,
  startNewResearch = false,
  initialWorkflow = "research_team",
  historyOnly = false,
  onReuseRequest,
}: {
  notebookId: string;
  title: string;
  sources: Source[];
  notes: SearchNote[];
  onCitation: (c: Citation) => void;
  onSave: (a: StudyArtifact) => void;
  onSaveResearch: (run: WorkflowRun) => Promise<void>;
  savedResearchRuns: string[];
  onConnections: () => void;
  inspectionTraceId?: string;
  startNewResearch?: boolean;
  initialWorkflow?: EvidenceWorkflow;
  historyOnly?: boolean;
  onReuseRequest?: (prompt: string) => void;
}) {
  const [state, setState] = useState<WorkspaceState>();
  const [focusRunId, setFocusRunId] = useState("");
  const surface = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusRunId || !state?.runs.some((r) => r.id === focusRunId)) return;
    const run = surface.current?.querySelector<HTMLElement>(
      `[data-run-id="${focusRunId}"]`,
    );
    const panel = run?.closest<HTMLElement>(".agent-panel");
    if (run && panel)
      panel.scrollTo({
        top:
          panel.scrollTop +
          run.getBoundingClientRect().top -
          panel.getBoundingClientRect().top -
          16,
      });
    setFocusRunId("");
  }, [focusRunId, state]);
  const [runStatusVisible, setRunStatusVisible] = useState(true);
  const [backend, setBackend] = useState("");
  const [modelCatalog, setModelCatalog] = useState<ResearchModelCatalog>();
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [metrics, setMetrics] = useState<TraceMetrics>();
  const [selectedTraceId, setSelectedTraceId] = useState("");
  const diagnostics = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!inspectionTraceId) return;
    setSelectedTraceId(inspectionTraceId);
    if (diagnostics.current) {
      diagnostics.current.open = true;
      diagnostics.current.scrollIntoView({ block: "start" });
    }
  }, [inspectionTraceId]);
  const [traceDetail, setTraceDetail] = useState<TraceDetail>();
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [traceCursor, setTraceCursor] = useState(0);
  const [webEnabled, setWebEnabled] = useState(false);
  const [teamPlan, setTeamPlan] = useState<ResearchPlan>();
  const [planKey, setPlanKey] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [workflow, setWorkflow] = useState<EvidenceWorkflow>(initialWorkflow);
  const [researchPrompts, setResearchPrompts] = useState<ResearchPrompts>(
    () => {
      try {
        const stored = JSON.parse(
          localStorage.getItem("nemodoc-research-prompts") || "null",
        );
        return Object.fromEntries(
          Object.entries(DEFAULT_RESEARCH_PROMPTS).map(([key, fallback]) => [
            key,
            typeof stored?.[key] === "string" && stored[key].length <= 12000
              ? stored[key]
              : fallback,
          ]),
        ) as ResearchPrompts;
      } catch {
        return { ...DEFAULT_RESEARCH_PROMPTS };
      }
    },
  );
  const [promptSaveError, setPromptSaveError] = useState(false);
  const [composeOpen, setComposeOpen] = useState(true);
  const initializedNotebook = useRef("");
  const [prompt, setPrompt] = useState("");
  const [sourceIds, setSources] = useState<string[]>([]),
    [noteIds, setNotes] = useState<string[]>([]);
  const [progress, setProgress] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (workflow !== "research_team") return;
    const controller = new AbortController();
    const update = () =>
      void apiJSON<ResearchModelCatalog>(
        `${root}/model-profiles`,
        undefined,
        controller.signal,
      )
        .then(setModelCatalog)
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    update();
    const timer = setInterval(update, 5000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [workflow, notebookId]);
  const refresh = async () => {
    const next = await apiJSON<WorkspaceState>(
      `${root}/${encodeURIComponent(notebookId)}`,
    );
    setState(next);
    setRunStatusVisible(true);
  };
  useEffect(() => {
    const controller = new AbortController();
    setRunStatusVisible(false);
    const update = () =>
      void apiJSON<WorkspaceState>(
        `${root}/${encodeURIComponent(notebookId)}`,
        undefined,
        controller.signal,
      )
        .then((next) => {
          setState(next);
          if (initializedNotebook.current !== notebookId) {
            initializedNotebook.current = notebookId;
            setComposeOpen(startNewResearch || !next.runs.length);
          }
          setRunStatusVisible(true);
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setRunStatusVisible(false);
            setError(e.message);
          }
        });
    update();
    void apiJSON<{ backend: string }>(
      `${root}/status`,
      undefined,
      controller.signal,
    )
      .then((s) => setBackend(s.backend))
      .catch(() => {});
    const timer = setInterval(update, 2500);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [notebookId]);
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      try {
        const [history, summary] = await Promise.all([
          apiJSON<{ traces: TraceSummary[] }>(
            `${root}/${encodeURIComponent(notebookId)}/traces`,
            undefined,
            controller.signal,
          ),
          apiJSON<TraceMetrics>(
            `${root}/${encodeURIComponent(notebookId)}/traces/metrics`,
            undefined,
            controller.signal,
          ),
        ]);
        if (controller.signal.aborted) return;
        setTraces(history.traces);
        setMetrics(summary);
        setSelectedTraceId((current) =>
          current && history.traces.some((trace) => trace.traceId === current)
            ? current
            : (history.traces[0]?.traceId ?? ""),
        );
      } catch (cause) {
        if ((cause as Error).name !== "AbortError")
          setError((cause as Error).message);
      }
    };
    void update();
    const timer = setInterval(update, 2500);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [notebookId]);
  useEffect(() => {
    if (!selectedTraceId) {
      setTraceEvents([]);
      setTraceDetail(undefined);
      setTraceCursor(0);
      return;
    }
    const controller = new AbortController();
    let cursor = 0;
    let busyPolling = false;
    setTraceEvents([]);
    setTraceDetail(undefined);
    setTraceCursor(0);
    const update = async () => {
      if (busyPolling) return;
      busyPolling = true;
      try {
        const base = `${root}/${encodeURIComponent(notebookId)}/traces/${encodeURIComponent(selectedTraceId)}`;
        const [detail, page] = await Promise.all([
          apiJSON<TraceDetail>(base, undefined, controller.signal),
          apiJSON<{
            events: TraceEvent[];
            nextCursor: number;
            hasMore: boolean;
          }>(
            `${base}/events?after=${cursor}&limit=200`,
            undefined,
            controller.signal,
          ),
        ]);
        if (controller.signal.aborted) return;
        setTraceDetail(detail);
        if (page.events.length)
          setTraceEvents((current) => {
            const known = new Set(current.map((event) => event.eventId));
            return [
              ...current,
              ...page.events.filter((event) => !known.has(event.eventId)),
            ];
          });
        cursor = page.nextCursor;
        setTraceCursor(cursor);
      } catch (cause) {
        if ((cause as Error).name !== "AbortError")
          setError((cause as Error).message);
      } finally {
        busyPolling = false;
      }
    };
    void update();
    const timer = setInterval(update, 1500);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [notebookId, selectedTraceId]);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
  const exportTrace = async (id: string) => {
    const result = await readCompleteTrace(notebookId, id);
    download(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
      `agent-trace-${id}.json`,
    );
  };
  const approvedNotes = notes.filter(
    (n) => !n.references?.some((r) => !sourceIds.includes(r.sourceId)),
  );
  const researchKey = JSON.stringify([
    notebookId,
    prompt,
    sourceIds,
    noteIds,
    webEnabled,
    state?.revision,
    modelCatalog?.revision,
    researchPrompts,
  ]);
  const validPlan = teamPlan && researchPlanSchema.safeParse(teamPlan).success;
  const routeReady = teamPlan?.agents.every((agent) =>
    modelCatalog?.profiles.some(
      (profile) =>
        profile.id === (agent.modelProfileId ?? "default") && profile.tested,
    ),
  );
  const researchReady =
    validPlan && reviewed && planKey === researchKey && routeReady;
  return (
    <section
      ref={surface}
      className="evidence-workflows"
      aria-label="Evidence workflows"
    >
      {!historyOnly && (
        <>
          <div className="research-heading">
            <h2>
              {workflow === "research_team"
                ? "Research a question"
                : "Study tools"}
            </h2>
            {workflow === "research_team" && (
              <p className="agent-fine">
                Choose sources, review how the agents will work, then start your
                research.
              </p>
            )}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {initialWorkflow !== "research_team" && (
            <label className="field-label research-task-type">
              Task type
              <select
                aria-label="Task type"
                value={workflow}
                onChange={(e) => {
                  setWorkflow(e.target.value as EvidenceWorkflow);
                  setComposeOpen(true);
                }}
              >
                <option value="study_revision">Revision plan</option>
                <option value="research_synthesis">Research synthesis</option>
              </select>
            </label>
          )}
          <details
            className="agent-form research-evidence"
            open={!state?.revision}
          >
            <summary>
              1 · Sources
              {state?.revision ? (
                <span className="research-selection-count">
                  {state.sources.length} shared
                </span>
              ) : null}
            </summary>
            <p className="agent-fine">
              Save extracted document text and selected notes for research runs.
              Updates in your notebook are included when you refresh this copy.
              Original files remain in this browser.
            </p>
            <fieldset>
              <legend>Documents</legend>
              {sources.map((s) => (
                <label key={s.id}>
                  <input
                    type="checkbox"
                    checked={sourceIds.includes(s.id)}
                    onChange={() => {
                      const ids = toggle(sourceIds, s.id);
                      setSources(ids);
                      setNotes(
                        noteIds.filter(
                          (id) =>
                            !notes
                              .find((n) => n.id === id)
                              ?.references?.some(
                                (r) => !ids.includes(r.sourceId),
                              ),
                        ),
                      );
                      setConsent(false);
                    }}
                  />
                  {s.name}
                </label>
              ))}
            </fieldset>
            {!!approvedNotes.length && (
              <fieldset>
                <legend>Notes</legend>
                {approvedNotes.length ? (
                  approvedNotes.map((n) => (
                    <label key={n.id}>
                      <input
                        type="checkbox"
                        checked={noteIds.includes(n.id)}
                        onChange={() => {
                          setNotes(toggle(noteIds, n.id));
                          setConsent(false);
                        }}
                      />
                      {n.title.slice(0, 100)}
                    </label>
                  ))
                ) : (
                  <p>Select documents to include their linked notes.</p>
                )}
              </fieldset>
            )}
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Keep a copy of this selected text on the server for research.
            </label>
            <div className="workflow-buttons">
              <button
                className="primary-button"
                disabled={busy || !consent || !sourceIds.length}
                onClick={() =>
                  void act(() =>
                    apiJSON(`${root}/snapshot`, {
                      notebookId,
                      title,
                      sources: sources
                        .filter((s) => sourceIds.includes(s.id))
                        .map(({ id, name, pages }) => ({ id, name, pages })),
                      notes: approvedNotes
                        .filter((n) => noteIds.includes(n.id))
                        .map((n) => ({
                          ...n,
                          tags: n.tags ?? [],
                          references: n.references ?? [],
                        })),
                      consent: true,
                    }),
                  )
                }
              >
                {state?.revision
                  ? "Update research sources"
                  : "Use selected sources"}
              </button>
              {state?.revision && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      apiJSON(`${root}/revoke`, { notebookId, confirm: true }),
                    )
                  }
                >
                  Revoke access
                </button>
              )}
            </div>
          </details>
          {state && (
            <details
              className="agent-form research-compose"
              open={composeOpen}
              onToggle={(e) => setComposeOpen(e.currentTarget.open)}
            >
              <summary>
                {workflow === "research_team"
                  ? "2 · Your research question"
                  : "Run with approved evidence"}
              </summary>
              <label className="field-label">
                What would you like to investigate?
                <textarea
                  aria-label="What would you like to investigate?"
                  placeholder="What would you like to investigate in these sources?"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />
              </label>
              {workflow === "research_team" && (
                <>
                  <ResearchPromptEditor
                    value={researchPrompts}
                    onChange={(next) => {
                      setResearchPrompts(next);
                      try {
                        localStorage.setItem(
                          "nemodoc-research-prompts",
                          JSON.stringify(next),
                        );
                        setPromptSaveError(false);
                      } catch {
                        setPromptSaveError(true);
                      }
                    }}
                  />
                  {promptSaveError && (
                    <p role="status" className="form-error">
                      Instructions apply to this session, but could not be saved
                      in this browser.
                    </p>
                  )}
                  <details className="research-options">
                    <summary>Research models</summary>
                    <button
                      type="button"
                      className="text-button"
                      onClick={onConnections}
                    >
                      Manage research models
                    </button>
                  </details>
                  <label>
                    <input
                      type="checkbox"
                      checked={webEnabled}
                      onChange={(e) => setWebEnabled(e.target.checked)}
                    />
                    Enable web research
                  </label>
                  {webEnabled && (
                    <p className="agent-fine">
                      Queries based on your selected sources are sent to your
                      search provider.
                    </p>
                  )}
                </>
              )}
              <fieldset>
                <legend>Approved documents</legend>
                {state.sources.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={sourceIds.includes(s.id)}
                      onChange={() => setSources(toggle(sourceIds, s.id))}
                    />
                    {s.name}
                  </label>
                ))}
              </fieldset>
              {!!state.notes.length && (
                <fieldset>
                  <legend>Approved notes</legend>
                  {state.notes.map((n) => (
                    <label key={n.id}>
                      <input
                        type="checkbox"
                        checked={noteIds.includes(n.id)}
                        onChange={() => setNotes(toggle(noteIds, n.id))}
                      />
                      {n.title.slice(0, 100)}
                    </label>
                  ))}
                </fieldset>
              )}
              {workflow !== "research_team" && (
                <label>
                  <input
                    type="checkbox"
                    checked={progress}
                    onChange={(e) => setProgress(e.target.checked)}
                  />
                  Use shared quiz progress ({state.attempts.length} attempts)
                </label>
              )}
              {workflow === "research_team" && (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={
                      busy ||
                      !state.revision ||
                      !prompt.trim() ||
                      (!sourceIds.length && !webEnabled) ||
                      !modelCatalog?.profiles.some(
                        (p) =>
                          p.id === modelCatalog.plannerProfileId && p.tested,
                      )
                    }
                    onClick={() =>
                      void act(async () => {
                        const key = researchKey;
                        const plan = await apiJSON<ResearchPlan>(
                          `${root}/research-plan`,
                          {
                            notebookId,
                            workflow,
                            prompt,
                            sourceIds,
                            noteIds,
                            webEnabled,
                            executionRoute: "application",
                            researchPrompts,
                          },
                        );
                        setTeamPlan(plan);
                        setPlanKey(key);
                        setReviewed(false);
                      })
                    }
                  >
                    {teamPlan ? "Regenerate assignments" : "Plan research"}
                  </button>
                  {teamPlan && (
                    <ResearchPlanEditor
                      plan={teamPlan}
                      models={modelCatalog}
                      researcherInstructions={researchPrompts.researcher}
                      onChange={(plan) => {
                        setTeamPlan(plan);
                        setReviewed(false);
                      }}
                    />
                  )}
                  {teamPlan && planKey !== researchKey && (
                    <p role="status">
                      The request, evidence, or connection changed. Regenerate
                      the team plan before starting.
                    </p>
                  )}
                  {teamPlan && (
                    <label>
                      <input
                        type="checkbox"
                        checked={reviewed}
                        disabled={planKey !== researchKey}
                        onChange={(e) => setReviewed(e.target.checked)}
                      />
                      I reviewed the team assignments
                    </label>
                  )}
                </>
              )}
              <button
                className="primary-button"
                disabled={
                  busy ||
                  !state.revision ||
                  (!sourceIds.length &&
                    !(workflow === "research_team" && webEnabled)) ||
                  (workflow === "research_team" && !researchReady) ||
                  (workflow === "research_synthesis" && sourceIds.length < 2) ||
                  (workflow === "study_revision" && !noteIds.length) ||
                  !prompt.trim() ||
                  state.runs.some(
                    (r) => r.status === "queued" || r.status === "running",
                  )
                }
                onClick={() =>
                  void act(async () => {
                    const queued = await apiJSON<WorkflowRun>(`${root}/run`, {
                      notebookId,
                      workflow,
                      prompt,
                      sourceIds,
                      noteIds,
                      includeProgress: progress,
                      ...(workflow === "research_team"
                        ? {
                            executionRoute: "application",
                            teamPlan,
                            webEnabled,
                            researchPrompts,
                          }
                        : {}),
                    });
                    setSelectedTraceId(queued.traceId ?? queued.id);
                    setFocusRunId(queued.id);
                    setComposeOpen(false);
                  })
                }
              >
                {workflow === "research_team"
                  ? "Start research"
                  : "Create proposal"}
              </button>
              {workflow === "research_synthesis" && sourceIds.length < 2 ? (
                <p className="agent-fine" role="status">
                  Select at least two sources to compare papers.
                </p>
              ) : workflow === "research_team" &&
                !sourceIds.length &&
                !webEnabled ? (
                <p className="agent-fine" role="status">
                  Select at least one approved source for the research team.
                </p>
              ) : workflow === "research_team" && !researchReady ? (
                <p className="agent-fine" role="status">
                  Generate and review a valid team plan with an available model
                  connection before starting.
                </p>
              ) : workflow === "study_revision" && !noteIds.length ? (
                <p className="agent-fine" role="status">
                  Select one or more notes to build a targeted revision plan.
                </p>
              ) : null}
            </details>
          )}
        </>
      )}
      {state?.runs.map((run) => (
        <article
          key={run.id}
          data-run-id={run.id}
          className="agent-form research-run"
        >
          <h4>
            {workflowNames[run.workflow]} ·{" "}
            {runStatusVisible ? run.status : "status unknown"}
          </h4>
          <details className="research-request">
            <summary>Research question</summary>
            <p>{run.prompt}</p>
          </details>
          {run.error && <p role="alert">{run.error}</p>}
          {run.workflow === "research_team" &&
            !["queued", "running"].includes(run.status) && (
              <div className="workflow-buttons research-report-actions">
                {run.status === "completed" && (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy || savedResearchRuns.includes(run.id)}
                    onClick={() => void act(() => onSaveResearch(run))}
                  >
                    {savedResearchRuns.includes(run.id)
                      ? "Saved to Notes"
                      : "Save report to Notes"}
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    !run.answer && !run.researchTeam?.some((a) => a.answer)
                  }
                  onClick={() =>
                    download(
                      new Blob([researchReportMarkdown(run, true)], {
                        type: "text/markdown",
                      }),
                      `research-${run.id}.md`,
                    )
                  }
                >
                  Download report
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    if (onReuseRequest) {
                      onReuseRequest?.(run.prompt);
                      return;
                    }
                    setWorkflow("research_team");
                    setPrompt(run.prompt);
                    setWebEnabled(!!run.webEnabled);
                    setSources(
                      run.sourceIds.filter((id) =>
                        state.sources.some((s) => s.id === id),
                      ),
                    );
                    setNotes(
                      run.noteIds.filter((id) =>
                        state.notes.some((n) => n.id === id),
                      ),
                    );
                    setTeamPlan(undefined);
                    setReviewed(false);
                    setComposeOpen(true);
                  }}
                >
                  Use request again
                </button>
              </div>
            )}
          {run.workflow === "research_team" &&
            (run.status === "queued" || run.status === "running") && (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void act(() =>
                    apiJSON(`${root}/cancel`, { notebookId, runId: run.id }),
                  )
                }
              >
                Cancel research
              </button>
            )}
          <AgentActivityFeed
            key={run.id}
            notebookId={notebookId}
            traceId={run.traceId}
            active={run.status === "running" || run.status === "queued"}
          />
          {run.workflow === "research_team" ? (
            <ResearchTeamRun
              run={run}
              statusVisible={runStatusVisible}
              onCitation={onCitation}
            />
          ) : (
            <p className="workflow-answer">{run.answer}</p>
          )}
          <details>
            <summary>
              Queries, evidence & execution · {run.steps.length} steps
            </summary>
            {run.steps.map((step, i) => (
              <p key={i}>{step.summary}</p>
            ))}
            {run.evidence.map((e) => (
              <details key={e.id}>
                <summary>
                  [{e.id}] {e.kind} · {e.records.length} records · {e.backend}
                </summary>
                <pre>
                  {JSON.stringify(
                    {
                      filters: e.filters,
                      records: e.records,
                      truncated: e.truncated,
                    },
                    null,
                    2,
                  )}
                </pre>
                {e.kind === "progress" &&
                  state.attempts
                    .filter((a) =>
                      e.records.some(
                        (row) =>
                          Array.isArray(row.attemptIds) &&
                          row.attemptIds.includes(a.id),
                      ),
                    )
                    .map((a) => (
                      <details key={a.id}>
                        <summary>
                          {a.title} · {new Date(a.completedAt).toLocaleString()}{" "}
                          · {a.id}
                        </summary>
                        {a.answers.map((q, i) => (
                          <div key={i}>
                            <p>{q.question}</p>
                            <p>
                              Chosen: {q.choices[q.selected]} · Correct:{" "}
                              {q.choices[q.correct]}
                            </p>
                            {q.references.map((r, j) => (
                              <button
                                key={j}
                                className="secondary-button"
                                onClick={() =>
                                  onCitation({
                                    id: 0,
                                    sourceId: r.sourceId,
                                    sourceName:
                                      state.sources.find(
                                        (s) => s.id === r.sourceId,
                                      )?.name ?? r.sourceId,
                                    page: r.page,
                                    text: q.question,
                                  })
                                }
                              >
                                Open page {r.page}
                              </button>
                            ))}
                          </div>
                        ))}
                      </details>
                    ))}
              </details>
            ))}
            {run.citations.map((c) => (
              <button
                key={c.id}
                className="secondary-button"
                title={c.text}
                onClick={() => onCitation(c)}
              >
                [{c.id}] {c.sourceName} · p. {c.page}
              </button>
            ))}
            <p>
              {run.calls} model calls
              {run.usage
                ? ` · ${run.usage.promptTokens + run.usage.completionTokens} tokens`
                : ""}
            </p>
          </details>
          {state.proposals
            .filter((p) => p.runId === run.id)
            .map((p) => (
              <div key={`${p.id}:${p.revision}`}>
                {p.report && (
                  <WorkflowReportView
                    report={p.report}
                    run={run}
                    state={state}
                    onCitation={onCitation}
                  />
                )}
                <ProposalEditor
                  proposal={p}
                  approvedIds={
                    state.receipts.find((r) => r.proposalId === p.id)
                      ?.actionIds ?? []
                  }
                  disabled={busy || run.status !== "completed"}
                  act={act}
                />
              </div>
            ))}
        </article>
      ))}
      {!!state?.materials.length && (
        <div className="agent-form">
          <h4>Approved materials</h4>
          {state.materials.map((m) => (
            <div key={m.id} className="workflow-buttons">
              <span>{m.title}</span>
              <button
                className="secondary-button"
                onClick={() => onSave({ ...m, notebookId })}
              >
                Import into Studio
              </button>
            </div>
          ))}
        </div>
      )}
      {!!state?.plan && (
        <details className="agent-form">
          <summary>Notebook plan</summary>
          <p className="workflow-answer">{state.plan}</p>
        </details>
      )}
      {!!state?.reviews.length && (
        <details className="agent-form">
          <summary>Review & reading tasks</summary>
          {state.reviews.map((r) => (
            <div key={r.id}>
              <p>
                {r.title} · {new Date(r.dueAt).toLocaleString()} · {r.status}
              </p>
              {r.resultRunId && (
                <p>
                  Run: {state.runs.find((v) => v.id === r.resultRunId)?.status}
                </p>
              )}
              {r.status === "pending" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      apiJSON(`${root}/review/complete`, {
                        notebookId,
                        id: r.id,
                      }),
                    )
                  }
                >
                  Mark complete
                </button>
              )}
            </div>
          ))}
        </details>
      )}
      {state?.outbox.map((o) => (
        <div key={o.id} className="agent-form">
          <strong>
            Email · {o.status === "unknown" ? "Check delivery" : o.status}
          </strong>
          <p>
            {o.target.recipient} · {o.title}
          </p>
          {o.error && <p role="alert">{o.error}</p>}
          {o.messageId && (
            <small>SMTP submission accepted · {o.messageId}</small>
          )}
        </div>
      ))}
      <details className="research-diagnostics" ref={diagnostics}>
        <summary>Run history and trace inspection</summary>
        <section
          className="agent-form trace-inspector"
          aria-label="Agent run traces"
        >
          <div className="trace-inspector-heading">
            <div>
              <h4>Saved activity</h4>
              <p>
                {metrics?.totalRuns ?? traces.length} traced runs · recent 30
                days
              </p>
              <p>
                {backend === "postgres"
                  ? "PostgreSQL workspace"
                  : "Local workspace"}
              </p>
            </div>
            <span
              className={`trace-persistence is-${metrics?.persistence ?? "degraded"}`}
            >
              {metrics?.persistence === "persisted"
                ? "PostgreSQL trace storage"
                : "Persistence degraded · local JSONL spool"}
            </span>
          </div>
          {metrics && (
            <div className="trace-metrics" aria-label="Run metrics">
              <span>
                Completion / failure / interruption:{" "}
                {metrics.completionRate === null ||
                metrics.failureRate === null ||
                metrics.interruptionRate === null
                  ? "Unknown"
                  : `${Math.round(metrics.completionRate * 100)}% / ${Math.round(metrics.failureRate * 100)}% / ${Math.round(metrics.interruptionRate * 100)}%`}
              </span>
              <span>
                Completed / failed / interrupted: {metrics.completedRuns} /{" "}
                {metrics.failedRuns} / {metrics.interruptedRuns}
              </span>
              <span>
                Latency p50 / p95:{" "}
                {metrics.latencyMs.p50 === null
                  ? "Unknown"
                  : `${Math.round(metrics.latencyMs.p50)} ms`}{" "}
                /{" "}
                {metrics.latencyMs.p95 === null
                  ? "Unknown"
                  : `${Math.round(metrics.latencyMs.p95)} ms`}
              </span>
              <span>
                Model calls: {metrics.modelCalls} · Tool calls:{" "}
                {metrics.toolCalls}
              </span>
              <span>
                Reported tokens:{" "}
                {metrics.promptTokens === null ||
                metrics.completionTokens === null
                  ? "Unknown"
                  : `${metrics.promptTokens} prompt · ${metrics.completionTokens} completion`}
              </span>
              <span>
                Citation checks: {metrics.citationChecksPassed} passed ·{" "}
                {metrics.citationChecksFailed} failed
              </span>
            </div>
          )}
          {traces.length ? (
            <>
              <label className="field-label">
                Notebook runs
                <select
                  aria-label="Select run trace"
                  value={selectedTraceId}
                  onChange={(event) => setSelectedTraceId(event.target.value)}
                >
                  {traces.map((trace) => (
                    <option key={trace.traceId} value={trace.traceId}>
                      {trace.name} · {trace.status} ·{" "}
                      {new Date(trace.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              {traceDetail && (
                <>
                  <div className="trace-detail-heading">
                    <p>
                      {traceDetail.runner.replaceAll("_", " ")} ·{" "}
                      {traceDetail.status}
                      {traceDetail.durationMs !== undefined &&
                        ` · ${traceDetail.durationMs} ms`}
                    </p>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() =>
                        void act(() => exportTrace(traceDetail.traceId))
                      }
                    >
                      Export redacted trace JSON
                    </button>
                  </div>
                  {traceDetail.error && <p role="alert">{traceDetail.error}</p>}
                  <details className="trace-span-list">
                    <summary>
                      Agent and execution spans · {traceDetail.spans.length}
                    </summary>
                    {traceDetail.spans.map((span) => (
                      <details className="trace-span" key={span.spanId}>
                        <summary>
                          {span.name} · {span.kind} · {span.status}
                          {span.durationMs !== undefined &&
                            ` · ${span.durationMs} ms`}
                          {span.attempt !== undefined &&
                            ` · attempt ${span.attempt}`}
                        </summary>
                        <pre>{JSON.stringify(span, null, 2)}</pre>
                      </details>
                    ))}
                  </details>
                  <details className="trace-event-list">
                    <summary>
                      Persisted event timeline · {traceEvents.length} events ·
                      cursor {traceCursor}
                    </summary>
                    {traceEvents.map((event) => (
                      <details className="trace-event" key={event.eventId}>
                        <summary>
                          {event.sequence} · {event.type.replaceAll(".", " · ")}{" "}
                          · {new Date(event.at).toLocaleTimeString()}
                        </summary>
                        <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                      </details>
                    ))}
                  </details>
                </>
              )}
            </>
          ) : (
            <p className="agent-fine">
              No agent runs have been recorded for this notebook.
            </p>
          )}
        </section>
      </details>
      {state?.revision && (
        <button
          className="secondary-button"
          onClick={() =>
            download(
              new Blob([JSON.stringify(state, null, 2)], {
                type: "application/json",
              }),
              "agent-workspace.json",
            )
          }
        >
          Export approved workspace
        </button>
      )}
    </section>
  );
}

function ResearchTeamRun({
  run,
  statusVisible,
  onCitation,
}: {
  run: WorkspaceState["runs"][number];
  statusVisible: boolean;
  onCitation: (citation: Citation) => void;
}) {
  const team = run.researchTeam ?? [];
  const completed = team.filter((a) => a.status === "completed").length;
  const researchersDone = team
    .filter((a) => a.role !== "reviewer")
    .every((a) => a.status === "completed");
  const phase = run.status === "completed" ? 2 : researchersDone ? 1 : 0;
  const active = statusVisible && run.status === "running";
  return (
    <section className="research-team" aria-label="Research team run">
      <ol className="research-progress" aria-label="Research progress">
        {["Research", "Review", "Report"].map((name, index) => (
          <li
            key={name}
            className={
              statusVisible && (index < phase || run.status === "completed")
                ? "is-complete"
                : active && index === phase
                  ? "is-current"
                  : ""
            }
            aria-current={active && index === phase ? "step" : undefined}
          >
            <span aria-hidden="true">
              {statusVisible &&
              (index < phase || run.status === "completed") ? (
                <Check size={14} />
              ) : index === 1 ? (
                <ShieldCheck size={14} />
              ) : index === 2 ? (
                <ArrowDownToLine size={14} />
              ) : (
                <Circle size={12} />
              )}
            </span>
            {name}
          </li>
        ))}
      </ol>
      {!!run.answer && (
        <section className="workflow-report research-team-synthesis">
          <h4>Research report</h4>
          <p className="agent-fine">
            AI-reviewed draft · check the cited pages before relying on its
            findings.
          </p>
          <ResearchMarkdown
            content={run.answer}
            run={run}
            onCitation={onCitation}
          />
        </section>
      )}
      <div className="research-team-heading">
        <div>
          <h5>Research team</h5>
          <p>
            {statusVisible
              ? `${completed} of ${team.length} finished`
              : `${team.length} agents · status unavailable`}
          </p>
          {run.plannerModel && (
            <p className="agent-fine">Planner: {run.plannerModel.name}</p>
          )}
        </div>
      </div>
      <div className="research-team-grid">
        {team.map((agent) => {
          const activity = statusVisible ? sceneStatus(agent) : "unknown";
          return (
            <article
              className="research-agent-card"
              data-activity={activity}
              key={agent.id}
            >
              <div className="research-agent-heading">
                <div
                  className={`research-agent-indicator is-${activity}`}
                  aria-hidden="true"
                >
                  {activity === "running" ? (
                    <LoaderCircle size={18} />
                  ) : activity === "completed" ? (
                    <Check size={18} />
                  ) : agent.role === "reviewer" ? (
                    <ShieldCheck size={18} />
                  ) : (
                    <Circle size={16} />
                  )}
                </div>
                <div>
                  <h6>{agent.name}</h6>
                  <p className="research-agent-role">
                    {agent.role === "reviewer"
                      ? "Critical reviewer"
                      : "Researcher"}
                  </p>
                </div>
                <span className={`agent-monitor-status is-${activity}`}>
                  {activityLabels[activity]}
                </span>
              </div>
              <p className="research-agent-model">
                {agent.modelRoute?.name ||
                  agent.assignedModel ||
                  "Model unknown"}
              </p>
              <p className="research-agent-stage" role="status">
                {statusVisible
                  ? agent.stage === "queued" && agent.role === "reviewer"
                    ? "Waiting for the researchers"
                    : stageLabels[agent.stage] || "Status unknown"
                  : "Status unknown"}
              </p>
              <details className="research-agent-assignment">
                <summary>Assignment</summary>
                <p className="research-agent-focus">{agent.focus}</p>
              </details>
              {agent.instructions && (
                <ResearchInstructions
                  name={agent.name}
                  content={agent.instructions}
                />
              )}
              <details className="research-agent-details">
                <summary>Model & usage</summary>
                <p className="research-agent-runtime">
                  Agent: <code>{agent.id}</code>
                  <br />
                  Model: <code>{agent.assignedModel || "Unverified"}</code>
                  {agent.modelRoute && (
                    <>
                      <br />
                      Profile: {agent.modelRoute.name}
                      <br />
                      {agent.modelRoute.selection === "automatic"
                        ? "Planner choice"
                        : agent.modelRoute.selection === "manual"
                          ? "Manual choice"
                          : "Default choice"}
                      : {agent.modelRoute.reason}
                    </>
                  )}
                  {agent.returnedModel && (
                    <>
                      <br />
                      Reported model: <code>{agent.returnedModel}</code>
                    </>
                  )}
                </p>
                <p className="research-agent-usage">
                  {agent.modelCalls !== undefined &&
                    ` · ${agent.modelCalls}/${run.teamPlan ? researchLimits[agent.role === "reviewer" ? "reviewer" : "researcher"].modelCalls : 3} model calls`}
                  {agent.readActions !== undefined &&
                    ` · ${agent.readActions}/${run.teamPlan ? researchLimits[agent.role === "reviewer" ? "reviewer" : "researcher"].toolActions : 6} tool actions`}
                </p>
                {agent.usage && (
                  <p>
                    {agent.usage.promptTokens} input ·{" "}
                    {agent.usage.completionTokens} output tokens
                  </p>
                )}
              </details>
              {agent.error && <p role="alert">{agent.error}</p>}
              {agent.answer && (
                <details className="research-agent-findings">
                  <summary>Read this agent’s findings</summary>
                  <ResearchMarkdown
                    content={agent.answer}
                    run={run}
                    onCitation={onCitation}
                  />
                </details>
              )}
            </article>
          );
        })}
      </div>
      {!!run.webEvidence?.length && (
        <details>
          <summary>Web evidence · {run.webEvidence.length} pages</summary>
          {run.webEvidence.map((e) => (
            <article key={e.id}>
              <a href={e.url} target="_blank" rel="noreferrer">
                [{e.id}] {e.title}
              </a>
              <p>
                Retrieved {new Date(e.retrievedAt).toLocaleString()}
                {e.publishedAt ? ` · Published ${e.publishedAt}` : ""}
              </p>
              <blockquote>{e.text}</blockquote>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}

function ResearchMarkdown({
  content,
  run,
  onCitation,
}: {
  content: string;
  run: WorkspaceState["runs"][number];
  onCitation: (citation: Citation) => void;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        [rehypeKatex, { trust: false, maxExpand: 1000, maxSize: 20 }],
      ]}
      components={{
        a: ({ href, children }) => {
          const citation = href?.startsWith("#citation-")
            ? run.citations.find(
                (item) => item.id === Number(href.slice("#citation-".length)),
              )
            : undefined;
          const web = href?.startsWith("#citation-")
            ? run.webEvidence?.find((e) => e.id === Number(href.slice(10)))
            : undefined;
          if (web)
            return (
              <a
                className="inline-citation"
                href={web.url}
                title={`${web.title} · retrieved ${new Date(web.retrievedAt).toLocaleString()}\n${web.text}`}
                target="_blank"
                rel="noreferrer"
              >
                {children}
              </a>
            );
          return citation ? (
            <button
              className="inline-citation"
              aria-label={`Open ${citation.sourceName}, page ${citation.page}, citation ${citation.id}`}
              onClick={() =>
                onCitation({
                  id: citation.id,
                  sourceId: citation.sourceId,
                  sourceName: citation.sourceName,
                  page: citation.page,
                  text: citation.text,
                })
              }
            >
              {children}
            </button>
          ) : (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {citationMarkdown(content, [
        ...run.citations,
        ...(run.webEvidence ?? []),
      ])}
    </ReactMarkdown>
  );
}

function WorkflowReportView({
  report,
  run,
  state,
  onCitation,
}: {
  report: WorkflowReport;
  run: WorkspaceState["runs"][number];
  state: WorkspaceState;
  onCitation: (citation: Citation) => void;
}) {
  const citationButton = (id: number, key: string) => {
    const citation = run.citations.find((candidate) => candidate.id === id);
    if (!citation) return null;
    return (
      <button
        key={`${key}:${id}`}
        className="secondary-button workflow-citation"
        title={citation.text}
        onClick={() => onCitation(citation)}
      >
        [{id}] {citation.sourceName} · p. {citation.page}
      </button>
    );
  };
  if (report.kind === "study_revision") {
    const progressLabel =
      report.progressStatus === "not_shared"
        ? "Quiz history was not shared. Learning gaps are unknown."
        : report.progressStatus === "no_recorded_attempts"
          ? "No quiz attempts were recorded. Learning gaps are unknown."
          : "Based on the quiz attempts shared for this notebook.";
    return (
      <section className="workflow-report" aria-label="Study evidence summary">
        <h4>Study focus</h4>
        <p className="workflow-report-status">{progressLabel}</p>
        <div className="workflow-focus-list">
          {report.focusAreas.map((focus, index) => (
            <article className="workflow-focus" key={`${focus.topic}:${index}`}>
              <h5>{focus.topic}</h5>
              <p>{focus.observation}</p>
              <p className="workflow-report-meta">
                Notes:{" "}
                {focus.noteIds
                  .map(
                    (id) =>
                      state.notes.find((note) => note.id === id)?.title ?? id,
                  )
                  .join(", ")}
                {focus.attemptIds.length > 0 && (
                  <>
                    {" "}
                    · Quiz attempts:{" "}
                    {focus.attemptIds
                      .map(
                        (id) =>
                          state.attempts.find((attempt) => attempt.id === id)
                            ?.title ?? id,
                      )
                      .join(", ")}
                  </>
                )}
              </p>
              <div className="workflow-citations">
                {focus.citationIds.map((id) => citationButton(id, focus.topic))}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }
  const relationLabel: Record<
    (typeof report.comparisons)[number]["relation"],
    string
  > = {
    supports: "Supports",
    qualifies: "Qualifies",
    conflicts: "Conflicts",
    insufficient_evidence: "Insufficient evidence",
  };
  return (
    <section className="workflow-report" aria-label="Research evidence report">
      <h4>Evidence by paper</h4>
      <div className="workflow-table-scroll">
        <table className="workflow-evidence-table">
          <thead>
            <tr>
              <th scope="col">Paper</th>
              <th scope="col">Finding</th>
              <th scope="col">Method / population</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {report.papers.map((paper) => (
              <tr key={paper.sourceId}>
                <th scope="row">
                  {state.sources.find((source) => source.id === paper.sourceId)
                    ?.name ?? paper.sourceId}
                </th>
                <td>{paper.finding}</td>
                <td>{paper.methodPopulation}</td>
                <td>
                  <div className="workflow-citations">
                    {paper.citationIds.map((id) =>
                      citationButton(id, paper.sourceId),
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4>Cross-paper comparison</h4>
      <div className="workflow-comparisons">
        {report.comparisons.map((comparison, index) => (
          <article
            className="workflow-focus"
            key={`${comparison.question}:${index}`}
          >
            <div className="workflow-comparison-heading">
              <strong>{comparison.question}</strong>
              <span
                className={`workflow-relation workflow-relation-${comparison.relation}`}
              >
                {relationLabel[comparison.relation]}
              </span>
            </div>
            <p>{comparison.explanation}</p>
            <div className="workflow-citations">
              {comparison.citationIds.map((id) =>
                citationButton(id, `comparison-${index}`),
              )}
            </div>
          </article>
        ))}
      </div>
      {report.unsupportedClaims.length > 0 && (
        <div className="workflow-unsupported">
          <h4>Not established by these papers</h4>
          {report.unsupportedClaims.map((item, index) => (
            <p key={`${item.claim}:${index}`}>
              <strong>{item.claim}</strong> — {item.reason}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function ProposalEditor({
  proposal: p,
  approvedIds,
  disabled,
  act,
}: {
  proposal: ActionProposal;
  approvedIds: string[];
  disabled: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [actions, setActions] = useState(p.actions),
    [selected, setSelected] = useState(p.actions.map((a) => a.id));
  const dirty = JSON.stringify(actions) !== JSON.stringify(p.actions);
  const update = (id: string, patch: Partial<ProposalAction>) =>
    setActions(
      actions.map((a) =>
        a.id === id ? ({ ...a, ...patch } as ProposalAction) : a,
      ),
    );
  const base = { notebookId: p.notebookId, id: p.id, revision: p.revision };
  return (
    <div className="workflow-proposal">
      <h4>
        3 · Review proposal · revision {p.revision} · {p.status}
      </h4>
      {actions.map((a) => (
        <fieldset key={a.id} disabled={disabled || p.status !== "pending"}>
          <legend>
            <label>
              <input
                type="checkbox"
                disabled={disabled || p.status !== "pending"}
                checked={
                  p.status === "approved"
                    ? approvedIds.includes(a.id)
                    : selected.includes(a.id)
                }
                onChange={() =>
                  setSelected(
                    selected.includes(a.id)
                      ? selected.filter((id) => id !== a.id)
                      : [...selected, a.id],
                  )
                }
              />
              {a.kind.replaceAll("_", " ")}
              {p.status === "approved" && (
                <span>
                  {" "}
                  ·{" "}
                  {approvedIds.includes(a.id)
                    ? a.kind === "send_email"
                      ? "Queued for delivery"
                      : "Applied"
                    : "Not approved"}
                </span>
              )}
            </label>
          </legend>
          {"title" in a && (
            <label className="field-label">
              Title
              <input
                value={a.title}
                onChange={(e) => update(a.id, { title: e.target.value })}
              />
            </label>
          )}
          {a.kind === "send_email" && <p>To: {p.emailTarget?.recipient}</p>}
          <label className="field-label">
            {a.kind === "send_email" ? "Exact email preview" : "Content"}
            <textarea
              aria-label={
                a.kind === "send_email" ? "Exact email preview" : "Content"
              }
              rows={5}
              value={
                a.kind === "save_material"
                  ? a.content
                  : a.kind === "schedule_review"
                    ? a.prompt
                    : a.text
              }
              onChange={(e) =>
                update(
                  a.id,
                  a.kind === "save_material"
                    ? { content: e.target.value }
                    : a.kind === "schedule_review"
                      ? { prompt: e.target.value }
                      : { text: e.target.value },
                )
              }
            />
          </label>
          {a.kind === "schedule_review" && (
            <label className="field-label">
              Review time
              <input
                type="datetime-local"
                value={new Date(
                  a.dueAt - new Date(a.dueAt).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)}
                onChange={(e) => {
                  const dueAt = new Date(e.target.value).getTime();
                  if (Number.isFinite(dueAt)) update(a.id, { dueAt });
                }}
              />
            </label>
          )}
          {a.kind === "save_material" && a.items.length > 0 && (
            <details>
              <summary>Edit {a.items.length} practice items</summary>
              {a.items.map((item, i) => {
                const change = (patch: Partial<typeof item>) =>
                  update(a.id, {
                    items: a.items.map((current, index) =>
                      index === i ? { ...current, ...patch } : current,
                    ),
                  });
                return (
                  <fieldset key={i}>
                    <legend>Item {i + 1}</legend>
                    <label className="field-label">
                      Question
                      <input
                        value={item.question}
                        onChange={(e) => change({ question: e.target.value })}
                      />
                    </label>
                    <label className="field-label">
                      Answer
                      <textarea
                        value={item.answer}
                        onChange={(e) => change({ answer: e.target.value })}
                      />
                    </label>
                    {item.choices?.map((choice, j) => (
                      <label key={j} className="field-label">
                        Choice {j + 1}
                        <input
                          value={choice}
                          onChange={(e) =>
                            change({
                              choices: item.choices!.map((c, k) =>
                                k === j ? e.target.value : c,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                    {item.choices && (
                      <label className="field-label">
                        Correct answer
                        <select
                          value={item.correct}
                          onChange={(e) =>
                            change({ correct: Number(e.target.value) })
                          }
                        >
                          {item.choices.map((_, j) => (
                            <option key={j} value={j}>
                              Choice {j + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <small>
                      Sources:{" "}
                      {item.citationIds.map((id) => `[${id}]`).join(" ")}
                    </small>
                  </fieldset>
                );
              })}
            </details>
          )}
          <small>
            Evidence: {a.evidenceIds.map((id) => `[${id}]`).join(" ")}
          </small>
        </fieldset>
      ))}
      {p.status === "pending" && (
        <div className="workflow-buttons">
          <button
            className="secondary-button"
            disabled={disabled || !dirty}
            onClick={() =>
              void act(() =>
                apiJSON(`${root}/proposal/edit`, {
                  ...base,
                  actions: actions.map(({ id, ...action }) => ({ id, action })),
                }),
              )
            }
          >
            Save edits for review
          </button>
          <button
            className="primary-button"
            disabled={disabled || dirty || !selected.length}
            onClick={() =>
              void act(() =>
                apiJSON(`${root}/proposal/approve`, {
                  ...base,
                  actionIds: selected,
                  idempotencyKey: `${p.id}:${p.revision}`,
                  confirm: true,
                }),
              )
            }
          >
            Approve selected actions
          </button>
          <button
            className="secondary-button"
            disabled={disabled}
            onClick={() =>
              void act(() => apiJSON(`${root}/proposal/reject`, base))
            }
          >
            Reject proposal
          </button>
        </div>
      )}
    </div>
  );
}
