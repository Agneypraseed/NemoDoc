import { agentReportMarkdown } from "../lib/research-report";
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
import { AgentDelivery } from "./AgentDelivery";
import { EvidenceWorkflows } from "./EvidenceWorkflows";
import { AgentDashboard } from "./AgentDashboard";
import { AgentTaskComposer } from "./AgentTaskComposer";
import { AgentActivityFeed } from "./AgentActivityFeed";
import { ChevronDown } from "lucide-react";
import type { WorkflowRun } from "../workspace-types";
import type { SearchNote } from "../lib/search-notes";
import type {
  AgentState,
  AgentMemory,
  AgentSkill,
  AgentRun,
  SharedSource,
} from "../agent-types";
import type { Source, Citation, StudyArtifact } from "../types";
import type { AgentFile } from "../agent-file-types";
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
}: {
  notebookId: string;
  notebookTitle: string;
  workspaceNotes: SearchNote[];
  sources: Source[];
  notes: string;
  onCitation: (c: Citation) => void;
  onSave: (a: StudyArtifact) => void;
  onSaveResearch: (run: WorkflowRun | AgentRun) => Promise<void>;
  savedResearchRuns: string[];
  onSettings: () => void;
}) {
  const [data, setData] = useState<Overview>();
  const [view, setView] = useState<
    | "dashboard"
    | "tasks"
    | "research"
    | "memory"
    | "skills"
    | "access"
    | "connections"
  >("research");
  const [inspectionTraceId, setInspectionTraceId] = useState("");
  const [scheduleRequest, setScheduleRequest] = useState(0);
  const [reuseRequest, setReuseRequest] = useState<{ prompt: string }>();
  const [reducedMotion, setReducedMotion] = useState(() => {
    try {
      return localStorage.getItem("nemodoc.agent-reduced-motion") === "true";
    } catch {
      return false;
    }
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [consent, setConsent] = useState(false);
  const [memory, setMemory] = useState<Partial<AgentMemory>>();
  const [skill, setSkill] = useState<Partial<AgentSkill>>();
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
    setRunId("");
    setInspectionTraceId("");
    setConsent(false);
    setSelected([]);
    setError("");
    setMessage("");
  }, [notebookId]);
  if (!data)
    return (
      <div className="agent-panel">
        <p role="status">{error || "Loading your personal agent…"}</p>
      </div>
    );
  const approved = data.sources.filter((s) => s.notebookId === notebookId);
  const files = (data.files ?? []).filter((f) => f.notebookId === notebookId);
  const web = data.toolAccess?.web;
  const memories = data.memories.filter((m) => m.notebookId === notebookId);
  const tasks = data.tasks
    .filter((t) => t.notebookId === notebookId)
    .slice()
    .reverse();
  const runs = data.runs.filter((r) => r.notebookId === notebookId);
  const run = runId ? runs.find((r) => r.id === runId) : undefined;
  const plan = data.plans.find((p) => p.notebookId === notebookId);
  const renderRun = (result: AgentRun) => (
    <RunResult
      run={result}
      hideActivity
      savedReport={savedResearchRuns.includes(result.id)}
      onSaveReport={() =>
        void act(() => onSaveResearch(result), "Report saved to Notes.")
      }
      onCancel={() =>
        void act(
          () =>
            apiJSON("/api/agent/task/action", {
              id: result.taskId,
              action: "cancel",
            }),
          "Task cancelled.",
        )
      }
      onCitation={onCitation}
      onSave={(a) => {
        onSave({ ...a, notebookId });
        setMessage("Saved to this notebook’s Studio.");
      }}
    />
  );
  const sourcePermissions = (
    <>
      <h3>
        <ShieldCheck size={16} />
        Source permissions
      </h3>
      <p className="agent-intro">
        Approve extracted text for this notebook. A local snapshot lets the
        worker search while the browser is closed. Original PDFs and slides stay
        in browser storage. Notes are a snapshot; save these permissions again
        after editing notes.
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
        Store the selected extracted text on my local server and let my tasks
        send retrieved passages to the chosen model provider.
      </label>
      <button
        type="button"
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
            type="button"
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
    </>
  );
  return (
    <section
      className="agent-panel"
      aria-label="Personal agent"
      data-dashboard={view === "dashboard"}
      data-reduced-motion={reducedMotion}
    >
      <header className="agent-workspace-heading">
        <div>
          <h2>Notebook agent</h2>
          <p>{notebookTitle}</p>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => setView("connections")}
        >
          Connections
        </button>
      </header>
      <nav
        className="agent-subtabs agent-primary-nav"
        aria-label="Agent sections"
      >
        {(["research", "dashboard"] as const).map((v) => (
          <button
            key={v}
            className={view === v ? "active" : ""}
            aria-current={view === v ? "page" : undefined}
            onClick={() => {
              setView(v);
              if (v === "research") setRunId("");
              setInspectionTraceId("");
              setError("");
              setMessage("");
            }}
          >
            {v === "research" ? "Research" : "Dashboard"}
          </button>
        ))}
        <details className="agent-more-nav">
          <summary>
            More <ChevronDown size={13} />
          </summary>
          <div>
            {(["tasks", "memory", "skills", "access"] as const).map((v) => (
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
                {v === "tasks"
                  ? "Tasks & schedules"
                  : v === "access"
                    ? "Sources"
                    : v[0].toUpperCase() + v.slice(1)}
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
          renderResult={(traceId) => {
            const result = runs.find((r) => r.traceId === traceId);
            return result ? renderRun(result) : null;
          }}
          onResearch={(traceId) => {
            setInspectionTraceId(traceId ?? "");

            const matching = runs.find((r) => r.traceId === traceId);
            setView("research");
            setRunId(matching?.id ?? "");
          }}
        />
      )}
      {view === "research" && !!inspectionTraceId && !run && (
        <div className="agent-assistant-workspace">
          <EvidenceWorkflows
            key={view}
            initialWorkflow="research_team"
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
            historyOnly
            onReuseRequest={(prompt) => {
              setReuseRequest({ prompt });
              setInspectionTraceId("");
              setView("research");
            }}
          />
        </div>
      )}
      <div
        className="agent-assistant-workspace"
        hidden={view !== "research" || (!!inspectionTraceId && !run)}
      >
        <header className="agent-assistant-heading">
          <h3>What would you like to research?</h3>
        </header>
        <AgentTaskComposer
          key={notebookId}
          notebookId={notebookId}
          active={view === "research"}
          skills={data.skills}
          sources={approved}
          files={files}
          web={web}
          busy={busy}
          onSettings={onSettings}
          sourcePicker={sourcePermissions}
          onOpenSources={() => setSelected(approved.map((s) => s.id))}
          scheduleRequest={scheduleRequest}
          reuseRequest={reuseRequest}
          onUpload={async (file) => {
            let saved: AgentFile | undefined;
            await act(async () => {
              saved = await apiJSON<AgentFile>("/api/agent/files", {
                notebookId,
                name: file.name,
                content: await file.text(),
              });
            }, "File added to this notebook.");
            return saved;
          }}
          onSubmit={async (draft) => {
            const ok = await act(
              () => apiJSON("/api/agent/task", draft),
              draft.schedule || draft.dueAt > Date.now()
                ? "Task scheduled."
                : "Task queued. The local worker will begin shortly.",
            );
            if (ok) {
              setRunId("");
              setView("dashboard");
            }
            return ok;
          }}
        />
        {run && view === "research" && renderRun(run)}
      </div>
      {view === "tasks" && (
        <section
          className="agent-assistant-workspace"
          aria-label="Tasks & schedules"
        >
          <header className="agent-assistant-heading">
            <h3>Tasks & schedules</h3>
            <button
              className="primary-button"
              onClick={() => {
                setInspectionTraceId("");
                setRunId("");
                setScheduleRequest((n) => n + 1);
                setView("research");
              }}
            >
              <Plus size={14} />
              New scheduled task
            </button>
          </header>
          {!tasks.length && (
            <p>
              No saved jobs yet. Create a task in Research and choose when it
              should run.
            </p>
          )}
          <div className="agent-scheduled-list">
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

            <p className="agent-fine">
              <Clock3 size={13} /> Keep the local server running for scheduled
              tasks. Interrupted runs are never replayed automatically.
            </p>
          </div>
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
        </section>
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
          {sourcePermissions}
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
  onCancel,
  onCitation,
  onSave,
  hideActivity = false,
  savedReport = false,
  onSaveReport,
}: {
  run: AgentRun;
  hideActivity?: boolean;
  savedReport?: boolean;
  onSaveReport?: () => void;
  onCancel: () => void;
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
  return (
    <article className="agent-result">
      <div className="agent-section-title">
        <h4>{run.title}</h4>
        <span className={`agent-status ${run.status}`}>{run.status}</span>
        {run.status === "running" && (
          <button type="button" className="secondary-button" onClick={onCancel}>
            <X size={14} /> Cancel task
          </button>
        )}
      </div>
      <small>
        {run.connection.model} · {run.calls}/{run.modelCallLimit ?? 8} model
        calls
      </small>
      {run.toolAccess && (
        <p className="agent-tool-scope">
          <ShieldCheck size={15} /> Access · {run.toolAccess.fileIds.length}{" "}
          selected file
          {run.toolAccess.fileIds.length === 1 ? "" : "s"}
          {run.toolAccess.web && " · public web"}
          {run.toolAccess.writeFiles && " · new output files"}
        </p>
      )}
      {run.error && <p className="form-error">{run.error}</p>}
      {!hideActivity && (
        <AgentActivityFeed
          key={run.id}
          notebookId={run.notebookId}
          traceId={run.traceId}
          run={run}
        />
      )}
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
      {run.status === "completed" && run.answer && (
        <div className="workflow-buttons">
          <button
            className="primary-button"
            disabled={savedReport}
            onClick={onSaveReport}
          >
            {savedReport ? "Saved to Notes" : "Save report to Notes"}
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              download(
                new Blob([agentReportMarkdown(run)], { type: "text/markdown" }),
                `research-${run.id}.md`,
              )
            }
          >
            Download report
          </button>
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
              instructions: run.sent.instructions,
              specialistInstructions: run.sent.agentInstructions,
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
