import { useEffect, useState } from "react";
import {
  Clock3,
  Play,
  Pause,
  X,
  Plus,
  Brain,
  ShieldCheck,
  Download,
  Trash2,
  Pencil,
  Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiJSON } from "../lib/api";
import { citationReferences } from "../lib/citations";
import { download } from "../lib/storage";
import { AgentConnections } from "./AgentConnections";
import { AgentOverview } from "./AgentOverview";
import { AgentConfiguration } from "./AgentConfiguration";
import type { AgentRoleDrafts } from "../agent-config-types";
import { AgentDelivery } from "./AgentDelivery";
import { EvidenceWorkflows } from "./EvidenceWorkflows";
import { AgentDashboard } from "./AgentDashboard";
import { ChevronDown } from "lucide-react";
import type { WorkflowRun } from "../workspace-types";
import type { SearchNote } from "../lib/search-notes";
import type {
  AgentChannel,
  AgentConnections as ConnectionSummary,
} from "../agent-types";
import type {
  AgentState,
  AgentMemory,
  AgentSkill,
  AgentRun,
  SharedSource,
} from "../agent-types";
import type { Source, Citation, StudyArtifact } from "../types";
import { agentFileLimit, type AgentFile } from "../agent-file-types";
import type { PublicWebConnection } from "../web-research-types";

type Overview = Omit<AgentState, "sources"> & {
  toolAccess?: { web?: PublicWebConnection };
  sources: (Omit<SharedSource, "pages"> & {
    pageCount: number;
    characters: number;
  })[];
};
const at = (n: number) =>
  new Date(n).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
export function AgentPanel({
  notebookId,
  notebookTitle,
  workspaceNotes,
  sources,
  notes,
  onCitation,
  onSave,
  onSaveResearch,
  savedResearchRuns,
  onSettings,
  roleDrafts,
}: {
  notebookId: string;
  notebookTitle: string;
  workspaceNotes: SearchNote[];
  sources: Source[];
  notes: string;
  onCitation: (c: Citation) => void;
  onSave: (a: StudyArtifact) => void;
  onSaveResearch: (run: WorkflowRun) => Promise<void>;
  savedResearchRuns: string[];
  onSettings: () => void;
  roleDrafts: AgentRoleDrafts;
}) {
  const [data, setData] = useState<Overview>();
  const [view, setView] = useState<
    | "agents"
    | "dashboard"
    | "tasks"
    | "memory"
    | "skills"
    | "access"
    | "connections"
    | "settings"
  >("tasks");
  const [inspectionTraceId, setInspectionTraceId] = useState("");
  const [startNewResearch, setStartNewResearch] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => {
    try {
      return localStorage.getItem("nemodoc.agent-reduced-motion") === "true";
    } catch {
      return false;
    }
  });
  const [configureAgentId, setConfigureAgentId] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [form, setForm] = useState(false),
    [skillId, setSkillId] = useState("exam-prep");
  const [prompt, setPrompt] = useState(""),
    [title, setTitle] = useState("My study session");
  const [when, setWhen] = useState(""),
    [repeat, setRepeat] = useState<number | "weekdays">(0);
  const [weekdayTime, setWeekdayTime] = useState("08:00"),
    [timeZone, setTimeZone] = useState("Europe/Berlin");
  const [allowMemory, setAllowMemory] = useState(false),
    [allowSchedule, setAllowSchedule] = useState(false);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [allowWeb, setAllowWeb] = useState(false);
  const [webRevision, setWebRevision] = useState<string>();
  const [allowFileWrites, setAllowFileWrites] = useState(false);
  const [selected, setSelected] = useState<string[]>([]),
    [consent, setConsent] = useState(false);
  const [memory, setMemory] = useState<Partial<AgentMemory>>();
  const [skill, setSkill] = useState<Partial<AgentSkill>>();
  const [connectionSummary, setConnectionSummary] =
    useState<ConnectionSummary>();
  const [channels, setChannels] = useState<AgentChannel[]>([]);
  const noteId = "notes:" + notebookId;
  const [runId, setRunId] = useState("");
  const refresh = async (signal?: AbortSignal) =>
    setData(await apiJSON<Overview>("/api/agent", undefined, signal));
  useEffect(() => {
    const controller = new AbortController();
    const update = () =>
      void refresh(controller.signal).catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    update();
    const timer = setInterval(update, 3000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, []);
  const act = async (fn: () => Promise<unknown>, success = "Saved.") => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await refresh();
      setMessage(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!form) return;
    const controller = new AbortController();
    setConnectionSummary(undefined);
    void apiJSON<ConnectionSummary>(
      "/api/agent/connections",
      undefined,
      controller.signal,
    )
      .then(setConnectionSummary)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [form]);
  if (!data)
    return (
      <div className="agent-panel">
        <p role="status">{error || "Loading your personal agent…"}</p>
      </div>
    );
  const approved = data.sources.filter((s) => s.notebookId === notebookId);
  const files = (data.files ?? []).filter((f) => f.notebookId === notebookId);
  const web = data.toolAccess?.web;
  const webReady = !!web?.hasApiKey && web.tested;
  const memories = data.memories.filter((m) => m.notebookId === notebookId);
  const tasks = data.tasks
    .filter((t) => t.notebookId === notebookId)
    .slice()
    .reverse();
  const runs = data.runs.filter((r) => r.notebookId === notebookId);
  const run = runs.find((r) => r.id === runId) || runs[0];
  const plan = data.plans.find((p) => p.notebookId === notebookId);
  const submitTask = async () => {
    if (
      repeat !== "weekdays" &&
      when &&
      !Number.isFinite(new Date(when).getTime())
    ) {
      setError("Choose a valid time.");
      return;
    }
    const ok = await act(
      () =>
        apiJSON("/api/agent/task", {
          notebookId,
          title,
          prompt,
          skillId,
          sourceIds: selected,
          dueAt: when ? new Date(when).getTime() : Date.now(),
          repeatHours: repeat === "weekdays" ? 0 : repeat,
          schedule:
            repeat === "weekdays"
              ? { kind: "weekdays", time: weekdayTime, timeZone }
              : undefined,
          allowMemory,
          allowSchedule,
          fileIds,
          allowFileWrites,
          allowWeb,
          webRevision: allowWeb ? webRevision : undefined,
          channels,
          channelRevisions: Object.fromEntries(
            channels.map((channel) => [
              channel,
              connectionSummary?.[channel].revision || "",
            ]),
          ),
        }),
      when || repeat === "weekdays"
        ? "Task scheduled."
        : "Task queued. The local worker will begin shortly.",
    );
    if (ok) {
      setForm(false);
      setPrompt("");
    }
  };
  return (
    <section
      className="agent-panel"
      aria-label="Personal agent"
      data-dashboard={view === "dashboard"}
      data-reduced-motion={reducedMotion}
    >
      <nav
        className="agent-subtabs agent-primary-nav"
        aria-label="Agent sections"
      >
        {(["tasks", "settings", "dashboard", "connections"] as const).map(
          (v) => (
            <button
              key={v}
              aria-label={v === "settings" ? "Agent settings" : undefined}
              className={view === v ? "active" : ""}
              aria-current={view === v ? "page" : undefined}
              onClick={() => {
                setView(v);
                setInspectionTraceId("");
                setError("");
                setMessage("");
              }}
            >
              {v === "tasks" ? "Research" : v[0].toUpperCase() + v.slice(1)}
            </button>
          ),
        )}
        <details className="agent-more-nav">
          <summary>
            More <ChevronDown size={13} />
          </summary>
          <div>
            {(["agents", "memory", "skills", "access"] as const).map((v) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                onClick={(e) => {
                  setView(v);
                  setError("");
                  setMessage("");
                  if (v === "access") setSelected(approved.map((s) => s.id));
                  e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                {v === "access" ? "Sources" : v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
            <label>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => {
                  setReducedMotion(e.target.checked);
                  try {
                    localStorage.setItem(
                      "nemodoc.agent-reduced-motion",
                      String(e.target.checked),
                    );
                  } catch {
                    /* Session setting still works. */
                  }
                }}
              />
              Reduce motion
            </label>
          </div>
        </details>
      </nav>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="form-success" role="status">
          <Check size={14} />
          {message}
        </p>
      )}
      {view === "connections" && <AgentConnections />}
      {view === "dashboard" && (
        <AgentDashboard
          notebookId={notebookId}
          onResearch={(traceId) => {
            setInspectionTraceId(traceId ?? "");
            setStartNewResearch(!traceId);
            setView("tasks");
            const matching = runs.find((r) => r.traceId === traceId);
            if (matching) setRunId(matching.id);
          }}
        />
      )}
      {view === "settings" && (
        <AgentConfiguration
          initialAgentId={configureAgentId}
          drafts={roleDrafts}
          onConnections={() => setView("connections")}
        />
      )}
      {view === "agents" && (
        <AgentOverview
          key={notebookId}
          notebookId={notebookId}
          onConnections={() => setView("connections")}
          onTasks={() => setView("tasks")}
          onConfigure={(id) => {
            setConfigureAgentId(id || "");
            setView("settings");
          }}
        />
      )}
      {view === "tasks" && (
        <>
          <EvidenceWorkflows
            notebookId={notebookId}
            title={notebookTitle}
            sources={sources}
            notes={workspaceNotes}
            onCitation={onCitation}
            onSave={onSave}
            onSaveResearch={onSaveResearch}
            savedResearchRuns={savedResearchRuns}
            onConnections={() => setView("connections")}
            inspectionTraceId={inspectionTraceId}
            startNewResearch={startNewResearch}
          />
          <details
            className="agent-secondary-tasks"
            open={
              !!inspectionTraceId &&
              runs.some((r) => r.traceId === inspectionTraceId)
            }
          >
            <summary>Scheduled tasks & activity inbox</summary>
            <div className="agent-section-title">
              <h3>Tasks & reviews</h3>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setForm(!form);
                  setSelected(approved.map((s) => s.id));
                }}
              >
                <Plus size={14} />
                New task
              </button>
            </div>
            {!approved.length && (
              <div className="agent-empty">
                <ShieldCheck size={24} />
                <p>
                  Choose documents, add a text file in a new task, or allow web
                  research. The agent chooses tools within that access.
                </p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setView("access");
                    setSelected(sources.map((s) => s.id));
                  }}
                >
                  Choose sources
                </button>
              </div>
            )}
            {form && (
              <form
                className="agent-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitTask();
                }}
              >
                <label className="field-label">
                  Task name
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    maxLength={150}
                  />
                </label>
                <label className="field-label">
                  Reusable skill
                  <select
                    value={skillId}
                    onChange={(e) => setSkillId(e.target.value)}
                  >
                    <option value="" disabled>
                      Select a skill
                    </option>
                    {data.skills.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  What should I do?
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Prepare a study plan for my exam using these PDFs. Focus on the topics I struggle with."
                    required
                    maxLength={8000}
                    rows={4}
                  />
                </label>
                <fieldset>
                  <legend>Sources for this task</legend>
                  {approved.map((s) => (
                    <label className="check-field" key={s.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, s.id]
                              : selected.filter((id) => id !== s.id),
                          )
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="agent-tool-permissions">
                  <legend>Tools the agent may choose</legend>
                  <p className="agent-fine">
                    The agent decides when to search, read and write. These
                    permissions limit the available tools for this task.
                  </p>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={allowWeb}
                      disabled={!webReady && !allowWeb}
                      onChange={(e) => {
                        setAllowWeb(e.target.checked);
                        setWebRevision(
                          e.target.checked ? web?.revision : undefined,
                        );
                      }}
                    />
                    Allow public web search and page reading
                  </label>
                  {!webReady && (
                    <p className="agent-fine">
                      Save and test a search provider in Settings → Search
                      first.{" "}
                      <button type="button" onClick={onSettings}>
                        Open settings
                      </button>
                    </p>
                  )}
                  {allowWeb && webRevision !== web?.revision && (
                    <p role="status" className="agent-fine">
                      Search settings changed. Turn web access off and on to
                      approve the current connection.
                    </p>
                  )}
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={allowFileWrites}
                      onChange={(e) => setAllowFileWrites(e.target.checked)}
                    />
                    Allow new output files in this notebook’s agent workspace
                  </label>
                  <label className="field-label">
                    Add a text file
                    <input
                      type="file"
                      accept=".md,.txt,.csv,.json"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        if (file.size > agentFileLimit) {
                          setError("Choose a text file up to 64 KiB.");
                          return;
                        }
                        void act(async () => {
                          const saved = await apiJSON<AgentFile>(
                            "/api/agent/files",
                            {
                              notebookId,
                              name: file.name,
                              content: await file.text(),
                            },
                          );
                          setFileIds((ids) => [...ids, saved.id]);
                        }, "File copied to the local agent workspace and selected for this task.");
                      }}
                    />
                  </label>
                  {files.map((file) => (
                    <label className="check-field" key={file.id}>
                      <input
                        type="checkbox"
                        checked={fileIds.includes(file.id)}
                        disabled={
                          fileIds.length >= 20 && !fileIds.includes(file.id)
                        }
                        onChange={(e) =>
                          setFileIds(
                            e.target.checked
                              ? [...fileIds, file.id]
                              : fileIds.filter((id) => id !== file.id),
                          )
                        }
                      />
                      {file.name} ·{" "}
                      {file.origin === "agent"
                        ? "generated file"
                        : "uploaded file"}
                    </label>
                  ))}
                  <p className="agent-fine">
                    Only selected files can be read. New files never overwrite
                    originals. Text files: .md, .txt, .csv or .json, up to 64
                    KiB each. Web queries go to your saved search provider;
                    retrieved file and page text goes to your model. Every tool
                    attempt appears in the action history and redacted run
                    trace.
                  </p>
                </fieldset>
                {repeat !== "weekdays" && (
                  <label className="field-label">
                    Start time (leave blank to run now)
                    <input
                      type="datetime-local"
                      value={when}
                      onChange={(e) => setWhen(e.target.value)}
                    />
                  </label>
                )}
                <label className="field-label">
                  Repeat
                  <select
                    aria-label="Repeat"
                    value={repeat}
                    onChange={(e) =>
                      setRepeat(
                        e.target.value === "weekdays"
                          ? "weekdays"
                          : Number(e.target.value),
                      )
                    }
                  >
                    <option value={0}>Once</option>
                    <option value={24}>Daily</option>
                    <option value={168}>Weekly</option>
                    <option value="weekdays">Weekdays (Monday–Friday)</option>
                  </select>
                </label>
                {repeat === "weekdays" && (
                  <>
                    <label className="field-label">
                      Weekday delivery time
                      <input
                        type="time"
                        required
                        value={weekdayTime}
                        onChange={(e) => setWeekdayTime(e.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      Schedule time zone
                      <input
                        required
                        value={timeZone}
                        onChange={(e) => setTimeZone(e.target.value)}
                        placeholder="Europe/Berlin"
                      />
                    </label>
                    <p className="agent-fine">
                      Run Monday–Friday at this local time, including
                      daylight-saving changes. Delivery follows generation; keep
                      the server running.
                    </p>
                  </>
                )}
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={allowMemory}
                    onChange={(e) => setAllowMemory(e.target.checked)}
                  />
                  Allow progress memory updates
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={allowSchedule}
                    onChange={(e) => setAllowSchedule(e.target.checked)}
                  />
                  Allow one follow-up review per run
                </label>
                <fieldset>
                  <legend>Automatically deliver the completed answer</legend>
                  {(["email", "whatsapp"] as const).map((channel) => (
                    <label className="check-field" key={channel}>
                      <input
                        type="checkbox"
                        checked={channels.includes(channel)}
                        disabled={
                          !connectionSummary?.[channel].recipient ||
                          (channel === "email"
                            ? !connectionSummary.email.hasPassword
                            : !connectionSummary.whatsapp.hasApiKey)
                        }
                        onChange={(e) =>
                          setChannels(
                            e.target.checked
                              ? [...channels, channel]
                              : channels.filter((c) => c !== channel),
                          )
                        }
                      />
                      {channel === "email" ? "Email" : "WhatsApp"} to{" "}
                      {connectionSummary?.[channel].recipient ||
                        "a recipient you configure in Connections"}
                    </label>
                  ))}
                  <p className="agent-fine">
                    Selecting a channel authorizes delivery after each
                    successful run of this task. Follow-up reviews stay in the
                    app. Leave unchecked to preview and send manually.
                  </p>
                </fieldset>
                <p className="agent-fine">
                  This task sends its prompt, skill, this notebook’s memory and
                  plan, source names and retrieved passages to the saved
                  provider. Up to 8 model calls and 20 tool actions. Repeat
                  tasks keep using that provider and model; failed tasks pause.
                </p>
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    (!selected.length && !fileIds.length && !allowWeb) ||
                    (allowWeb &&
                      (!webReady || webRevision !== web?.revision)) ||
                    !data.skills.some((s) => s.id === skillId)
                  }
                  type="submit"
                >
                  <Play size={14} />
                  {when || repeat === "weekdays" ? "Schedule task" : "Run task"}
                </button>
              </form>
            )}
            {tasks.map((t) => (
              <article className="agent-task" key={t.id}>
                <div>
                  <h4>{t.title}</h4>
                  <span className={`agent-status ${t.status}`}>{t.status}</span>
                </div>
                <p>
                  {t.schedule
                    ? `Mon–Fri ${t.schedule.time} (${t.schedule.timeZone}) · `
                    : t.repeatHours
                      ? `Every ${t.repeatHours} hours · `
                      : ""}
                  {t.status === "active" && t.dueAt !== Number.MAX_SAFE_INTEGER
                    ? `Due ${at(t.dueAt)}`
                    : t.status === "active"
                      ? "Queued / running"
                      : `Created ${at(t.createdAt)}`}
                </p>
                <small>
                  {t.deliveries
                    ?.map((d) => `${d.channel} → ${d.recipient}`)
                    .join(" · ")}
                  {!!t.deliveries?.length && <br />}
                  {t.connection.model} · {t.sourceIds.length} approved source
                  {t.sourceIds.length === 1 ? "" : "s"}
                </small>
                <div className="agent-task-actions">
                  {t.status !== "cancelled" && (
                    <>
                      <button
                        disabled={
                          busy ||
                          runs.some(
                            (r) => r.taskId === t.id && r.status === "running",
                          )
                        }
                        onClick={() =>
                          void act(
                            () =>
                              apiJSON("/api/agent/task/action", {
                                id: t.id,
                                action: "run",
                              }),
                            "Queued for another run.",
                          )
                        }
                      >
                        <Play size={13} />
                        Run now
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            apiJSON("/api/agent/task/action", {
                              id: t.id,
                              action:
                                t.status === "active" ? "pause" : "resume",
                            }),
                          )
                        }
                      >
                        {t.status === "active" ? (
                          <Pause size={13} />
                        ) : (
                          <Play size={13} />
                        )}{" "}
                        {t.status === "active" ? "Pause" : "Resume"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () =>
                              apiJSON("/api/agent/task/action", {
                                id: t.id,
                                action: "cancel",
                              }),
                            "Task cancelled.",
                          )
                        }
                      >
                        <X size={13} />
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
            {plan && (
              <details className="agent-result">
                <summary>Your current study plan</summary>
                <div className="markdown">
                  <ReactMarkdown
                    disallowedElements={["img"]}
                    remarkPlugins={[remarkGfm]}
                  >
                    {plan.text}
                  </ReactMarkdown>
                </div>
              </details>
            )}
            {!!runs.length && (
              <>
                <h3>Activity inbox</h3>
                <label className="field-label">
                  Run history
                  <select
                    value={run?.id || ""}
                    onChange={(e) => setRunId(e.target.value)}
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} · {r.status} · {at(r.startedAt)}
                      </option>
                    ))}
                  </select>
                </label>
                {run && (
                  <RunResult
                    run={run}
                    onCitation={onCitation}
                    onSave={(a) => {
                      onSave({ ...a, notebookId });
                      setMessage("Saved to this notebook’s Studio.");
                    }}
                  />
                )}
              </>
            )}
            <p className="agent-fine">
              <Clock3 size={13} /> Keep the local server running for scheduled
              tasks. When it’s stopped, overdue tasks run once on restart;
              interrupted runs are never replayed automatically.
            </p>
          </details>
        </>
      )}
      {view === "memory" && (
        <>
          <div className="agent-section-title">
            <h3>
              <Brain size={16} />
              Notebook memory
            </h3>
            <button
              className="secondary-button"
              onClick={() =>
                setMemory({ kind: "goal", text: "", deadline: "" })
              }
            >
              <Plus size={14} />
              Add memory
            </button>
          </div>
          <p className="agent-fine">
            You control what is remembered. Every task for this notebook
            receives these memories. Deleting a memory stops the current run;
            old run disclosures retain their historical snapshot until you erase
            agent data.
          </p>
          {memory && (
            <form
              className="agent-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await act(() =>
                    apiJSON("/api/agent/memory", { ...memory, notebookId }),
                  )
                )
                  setMemory(undefined);
              }}
            >
              <label className="field-label">
                Memory type
                <select
                  value={memory.kind}
                  onChange={(e) =>
                    setMemory({
                      ...memory,
                      kind: e.target.value as AgentMemory["kind"],
                    })
                  }
                >
                  <option value="goal">Goal</option>
                  <option value="preference">Preference</option>
                  <option value="progress">Progress / weak topic</option>
                </select>
              </label>
              <label className="field-label">
                Memory
                <textarea
                  rows={3}
                  value={memory.text || ""}
                  onChange={(e) =>
                    setMemory({ ...memory, text: e.target.value })
                  }
                  required
                  maxLength={2000}
                />
              </label>
              <label className="field-label">
                Deadline (optional)
                <input
                  type="date"
                  value={memory.deadline || ""}
                  onChange={(e) =>
                    setMemory({ ...memory, deadline: e.target.value })
                  }
                />
              </label>
              <button className="primary-button" disabled={busy} type="submit">
                Save memory
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setMemory(undefined)}
              >
                Cancel
              </button>
            </form>
          )}
          {!memories.length && (
            <p className="agent-empty">
              Add your exam deadline, preferred pace, or a topic you want to
              improve.
            </p>
          )}
          {memories.map((m) => (
            <article className="agent-memory" key={m.id}>
              <div>
                <span className="agent-status">{m.kind}</span>
                <div>
                  <button aria-label="Edit memory" onClick={() => setMemory(m)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="Delete memory"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => apiJSON("/api/agent/memory/delete", { id: m.id }),
                        "Memory deleted.",
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p>{m.text}</p>
              {m.deadline && <small>Deadline: {m.deadline}</small>}
            </article>
          ))}
        </>
      )}
      {view === "skills" && (
        <>
          <div className="agent-section-title">
            <h3>Reusable skills</h3>
            <button
              className="secondary-button"
              onClick={() => setSkill({ name: "", instructions: "" })}
            >
              <Plus size={14} />
              New skill
            </button>
          </div>
          <p className="agent-fine">
            Skills guide the agent’s tool use and are shared across notebooks.
            Changes apply to future runs. A skill cannot grant access beyond a
            task’s permissions.
          </p>
          {skill && (
            <form
              className="agent-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act(() => apiJSON("/api/agent/skill", skill)))
                  setSkill(undefined);
              }}
            >
              <label className="field-label">
                Skill name
                <input
                  required
                  maxLength={100}
                  value={skill.name || ""}
                  onChange={(e) => setSkill({ ...skill, name: e.target.value })}
                />
              </label>
              <label className="field-label">
                Skill instructions
                <textarea
                  rows={6}
                  required
                  maxLength={5000}
                  value={skill.instructions || ""}
                  onChange={(e) =>
                    setSkill({ ...skill, instructions: e.target.value })
                  }
                />
              </label>
              <button className="primary-button" type="submit" disabled={busy}>
                Save skill
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setSkill(undefined)}
              >
                Cancel
              </button>
            </form>
          )}
          {data.skills.map((s) => (
            <article className="agent-skill" key={s.id}>
              <h4>{s.name}</h4>
              <p>{s.instructions}</p>
              <button className="secondary-button" onClick={() => setSkill(s)}>
                <Pencil size={13} />
                Edit skill
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void act(
                    () => apiJSON("/api/agent/skill/delete", { id: s.id }),
                    "Skill deleted.",
                  )
                }
              >
                <Trash2 size={13} />
                Delete
              </button>
            </article>
          ))}
        </>
      )}
      {view === "access" && (
        <>
          <h3>
            <ShieldCheck size={16} />
            Source permissions
          </h3>
          <p className="agent-intro">
            Approve extracted text for this notebook. A local snapshot lets the
            worker search while the browser is closed. Original PDFs and slides
            stay in browser storage. Notes are a snapshot; save these
            permissions again after editing notes.
          </p>
          {!!notes.trim() && (
            <label className="check-field">
              <input
                type="checkbox"
                checked={selected.includes(noteId)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, noteId]
                      : selected.filter((id) => id !== noteId),
                  )
                }
              />
              Notebook notes, saved answers and annotations
            </label>
          )}
          {sources.map((s) => (
            <label className="check-field" key={s.id}>
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, s.id]
                      : selected.filter((id) => id !== s.id),
                  )
                }
              />
              {s.name}
            </label>
          ))}
          <label className="check-field agent-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Store the selected extracted text on my local server and let my
            tasks send retrieved passages to the chosen model provider.
          </label>
          <button
            className="primary-button"
            disabled={busy || !consent}
            onClick={() =>
              void act(
                () =>
                  apiJSON("/api/agent/sources", {
                    notebookId,
                    consent: true,
                    sources: [
                      ...sources
                        .filter((s) => selected.includes(s.id))
                        .map(({ id, name, pages }) => ({
                          id,
                          notebookId,
                          name,
                          pages,
                        })),
                      ...(selected.includes(noteId) && notes.trim()
                        ? [
                            {
                              id: noteId,
                              notebookId,
                              name: "Notebook notes",
                              kind: "notes",
                              pages: notes.match(/[\s\S]{1,6000}/g) || [],
                            },
                          ]
                        : []),
                    ],
                  }),
                "Source permissions updated.",
              )
            }
          >
            <Check size={14} />
            Save source permissions
          </button>
          {!!approved.length && (
            <div className="agent-source-cache">
              <h4>Currently approved</h4>
              {approved.map((s) => (
                <p key={s.id}>
                  {s.name}
                  <small>
                    {s.pageCount} pages · {s.characters.toLocaleString()} text
                    characters
                  </small>
                </p>
              ))}
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void act(
                    () =>
                      apiJSON("/api/agent/sources", {
                        notebookId,
                        consent: true,
                        sources: [],
                      }),
                    "Cached text removed; affected tasks paused.",
                  )
                }
              >
                <Trash2 size={14} />
                Revoke all notebook sources
              </button>
            </div>
          )}
          <div className="privacy-note">
            <ShieldCheck size={18} />
            <p>
              Data is stored in the ignored local data folder. Hosted inference
              sends task context and retrieved text to your selected provider.
              Local inference stays on your running inference server. No
              automatic provider fallback occurs.
            </p>
          </div>
          <button className="secondary-button" onClick={onSettings}>
            Configure model connection
          </button>
          {data.receipts[0] && (
            <div className="agent-receipt">
              <h4>Last successful provider response</h4>
              <p>{data.receipts[0].model}</p>
              <small>
                {data.receipts[0].endpoint}
                <br />
                {at(data.receipts[0].at)} · {data.receipts[0].method}
              </small>
            </div>
          )}
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const value = await apiJSON<AgentState>("/api/agent/export");
                download(
                  new Blob([JSON.stringify(value, null, 2)], {
                    type: "application/json",
                  }),
                  "nemodoc-agent-data.json",
                );
              }, "Agent data exported. This separate export includes approved text, memory and history; keep it private.")
            }
          >
            <Download size={14} />
            Export agent data
          </button>
          <details className="agent-danger">
            <summary>Erase all agent data</summary>
            <p>
              Deletes all notebooks’ agent files, memories, cached text, tasks,
              plans, run history and receipts. Browser notebooks and connection
              settings remain available. Redacted run traces are stored
              separately and are retained.
            </p>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void act(
                  () =>
                    apiJSON("/api/agent/clear", {
                      confirm: "forget agent data",
                    }),
                  "Agent history and cached context erased. Connection settings remain.",
                )
              }
            >
              <Trash2 size={14} />
              Erase all agent data now
            </button>
          </details>
        </>
      )}
    </section>
  );
}
function RunResult({
  run,
  onCitation,
  onSave,
}: {
  run: AgentRun;
  onCitation: (c: Citation) => void;
  onSave: (a: Omit<StudyArtifact, "notebookId">) => void;
}) {
  const citedIds = new Set(
    citationReferences(
      run.answer,
      run.citations.map((c) => ({
        id: c.id,
        page: c.kind ? undefined : c.page,
      })),
    ),
  );
  const stageLabel: Record<string, string> = {
    queued: "Queued",
    retrieving: "Retrieving approved evidence",
    awaiting_model_response: "Waiting for inference",
    validating: "Validating citations",
    synthesizing: "Preparing result",
    completed: "Completed",
    failed: "Failed",
    interrupted: "Interrupted",
  };
  return (
    <article className="agent-result">
      <div className="agent-section-title">
        <h4>{run.title}</h4>
        <span className={`agent-status ${run.status}`}>{run.status}</span>
      </div>
      <small>
        {run.connection.model} · {run.calls}/8 model calls
      </small>
      {run.toolAccess && (
        <p className="agent-tool-scope">
          <ShieldCheck size={15} /> Autonomous tool selection ·{" "}
          {run.toolAccess.fileIds.length} selected file
          {run.toolAccess.fileIds.length === 1 ? "" : "s"}
          {run.toolAccess.web && " · public web"}
          {run.toolAccess.writeFiles && " · new output files"}
        </p>
      )}
      {run.status === "running" && (
        <p role="status">
          {stageLabel[run.stage || ""] || "Working"}
          {run.stage !== "awaiting_model_response" && "…"} actions will appear
          below.
        </p>
      )}
      {run.error && <p className="form-error">{run.error}</p>}
      {run.answer && (
        <div className="markdown">
          <ReactMarkdown
            disallowedElements={["img"]}
            remarkPlugins={[remarkGfm]}
          >
            {run.answer}
          </ReactMarkdown>
        </div>
      )}
      {run.status === "completed" && <AgentDelivery key={run.id} run={run} />}
      {run.citations
        .filter((c) => citedIds.has(c.id))
        .map((c) =>
          c.kind === "web" ||
          c.kind === "file" ||
          c.sourceId.startsWith("notes:") ? (
            <details key={c.id}>
              <summary>
                [{c.id}] {c.sourceName} ·{" "}
                {c.kind === "web"
                  ? "web page"
                  : c.kind === "file"
                    ? "local file"
                    : `section ${c.page}`}
              </summary>
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer">
                  Open cited page
                </a>
              )}
              <pre>{c.text}</pre>
            </details>
          ) : (
            <button
              className="agent-citation"
              key={c.id}
              onClick={() => onCitation(c)}
            >
              [{c.id}] {c.sourceName} · p. {c.page}
            </button>
          ),
        )}
      {run.materials.map((a) => (
        <details key={a.id}>
          <summary>
            {a.title} · {a.kind}
          </summary>
          <div className="markdown">
            <ReactMarkdown
              disallowedElements={["img"]}
              remarkPlugins={[remarkGfm]}
            >
              {a.content}
            </ReactMarkdown>
          </div>
          {a.items.map((item, i) => (
            <p key={i}>
              <strong>{item.question}</strong>
              <br />
              {item.answer}
            </p>
          ))}
          {!a.citations.some((c) => c.kind) && (
            <button
              className="secondary-button"
              onClick={() => onSave({ ...a, id: a.id })}
            >
              Save to Studio
            </button>
          )}
        </details>
      ))}
      {!!run.files?.length && (
        <section className="agent-output-files" aria-label="Agent output files">
          <h5>Created files</h5>
          {run.files.map((file) => (
            <a
              className="secondary-button"
              key={file.id}
              href={`/api/agent/files/${encodeURIComponent(file.id)}/download?notebookId=${encodeURIComponent(run.notebookId)}`}
              download={file.name}
            >
              <Download size={14} /> {file.name}{" "}
              <small>{file.bytes} bytes</small>
            </a>
          ))}
        </section>
      )}
      <details>
        <summary>Action history ({run.steps.length})</summary>
        <ol className="agent-steps">
          {run.steps.map((s, i) => (
            <li key={i}>
              <strong>{s.tool}</strong>
              {s.status && (
                <span className={`agent-step-status is-${s.status}`}>
                  {s.status === "succeeded"
                    ? "Succeeded"
                    : s.status === "rejected"
                      ? "Rejected"
                      : "Failed"}
                </span>
              )}
              <p>{s.summary}</p>
            </li>
          ))}
        </ol>
      </details>
      <details>
        <summary>What was sent for inference</summary>
        <p className="agent-fine">
          Provider: {run.connection.baseUrl}
          <br />
          Model: {run.connection.model}
          <br />
          The system instructions, source names, current time, task, skill,
          notebook memory/plan, selected file names and accumulated tool results
          are sent with each call. Retrieved passages are listed below.
          Generated assistant tool calls and prior replies are also sent on
          subsequent calls.
        </p>
        <pre>
          {JSON.stringify(
            {
              task: run.sent.prompt,
              skill: run.sent.skill,
              memories: run.sent.memories,
              plan: run.sent.plan,
              passages: run.citations,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </article>
  );
}
