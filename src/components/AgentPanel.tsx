import { useEffect, useState } from "react";
import {
  Bot,
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
import { download } from "../lib/storage";
import type {
  AgentState,
  AgentMemory,
  AgentSkill,
  AgentRun,
  SharedSource,
} from "../agent-types";
import type { Source, Citation, StudyArtifact } from "../types";

type Overview = Omit<AgentState, "sources"> & {
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
  sources,
  onCitation,
  onSave,
  onSettings,
}: {
  notebookId: string;
  sources: Source[];
  onCitation: (c: Citation) => void;
  onSave: (a: StudyArtifact) => void;
  onSettings: () => void;
}) {
  const [data, setData] = useState<Overview>();
  const [view, setView] = useState<"tasks" | "memory" | "skills" | "access">(
    "tasks",
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [form, setForm] = useState(false),
    [skillId, setSkillId] = useState("exam-prep");
  const [prompt, setPrompt] = useState(""),
    [title, setTitle] = useState("My study session");
  const [when, setWhen] = useState(""),
    [repeat, setRepeat] = useState(0);
  const [allowMemory, setAllowMemory] = useState(false),
    [allowSchedule, setAllowSchedule] = useState(false);
  const [selected, setSelected] = useState<string[]>([]),
    [consent, setConsent] = useState(false);
  const [memory, setMemory] = useState<Partial<AgentMemory>>();
  const [skill, setSkill] = useState<Partial<AgentSkill>>();
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
  if (!data)
    return (
      <div className="agent-panel">
        <p role="status">{error || "Loading your personal agent…"}</p>
      </div>
    );
  const approved = data.sources.filter((s) => s.notebookId === notebookId);
  const memories = data.memories.filter((m) => m.notebookId === notebookId);
  const tasks = data.tasks
    .filter((t) => t.notebookId === notebookId)
    .slice()
    .reverse();
  const runs = data.runs.filter((r) => r.notebookId === notebookId);
  const run = runs.find((r) => r.id === runId) || runs[0];
  const plan = data.plans.find((p) => p.notebookId === notebookId);
  const submitTask = async () => {
    if (when && !Number.isFinite(new Date(when).getTime())) {
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
          repeatHours: repeat,
          allowMemory,
          allowSchedule,
        }),
      when
        ? "Task scheduled."
        : "Task queued. The local worker will begin shortly.",
    );
    if (ok) {
      setForm(false);
      setPrompt("");
    }
  };
  return (
    <section className="agent-panel" aria-label="Personal agent">
      <header className="agent-heading">
        <div className="agent-avatar">
          <Bot size={23} />
        </div>
        <div>
          <div className="eyebrow">WORKING WITH YOU</div>
          <h2>Your personal agent</h2>
        </div>
      </header>
      <p className="agent-intro">
        A study partner with memory, reusable skills and a local task worker.
        Results arrive here, even when the browser is closed.
      </p>
      <div className="agent-subtabs" aria-label="Agent sections">
        {(["tasks", "memory", "skills", "access"] as const).map((v) => (
          <button
            key={v}
            className={view === v ? "active" : ""}
            onClick={() => {
              setView(v);
              if (v === "access") setSelected(approved.map((s) => s.id));
              setError("");
              setMessage("");
            }}
          >
            {v === "access" ? "Sources" : v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
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
      {view === "tasks" && (
        <>
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
                Choose which documents your agent can access before creating a
                task.
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
              <label className="field-label">
                Start time (leave blank to run now)
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </label>
              <label className="field-label">
                Repeat
                <select
                  value={repeat}
                  onChange={(e) => setRepeat(Number(e.target.value))}
                >
                  <option value={0}>Once</option>
                  <option value={24}>Daily</option>
                  <option value={168}>Weekly</option>
                </select>
              </label>
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
              <p className="agent-fine">
                This task sends its prompt, skill, this notebook’s memory and
                plan, source names and retrieved passages to the saved provider.
                Up to 8 model calls and 20 tool actions. Repeat tasks keep using
                that provider and model; failed tasks pause.
              </p>
              <button
                className="primary-button"
                disabled={
                  busy ||
                  !selected.length ||
                  !data.skills.some((s) => s.id === skillId)
                }
                type="submit"
              >
                <Play size={14} />
                {when ? "Schedule task" : "Run task"}
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
                {t.repeatHours ? `Every ${t.repeatHours} hours · ` : ""}
                {t.status === "active" && t.dueAt !== Number.MAX_SAFE_INTEGER
                  ? `Due ${at(t.dueAt)}`
                  : t.status === "active"
                    ? "Queued / running"
                    : `Created ${at(t.createdAt)}`}
              </p>
              <small>
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
                            action: t.status === "active" ? "pause" : "resume",
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
            stay in browser storage.
          </p>
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
                    sources: sources
                      .filter((s) => selected.includes(s.id))
                      .map(({ id, name, pages }) => ({
                        id,
                        notebookId,
                        name,
                        pages,
                      })),
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
              Deletes all notebooks’ agent memories, cached text, tasks, plans,
              run history and receipts. Browser notebooks remain available.
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
                  "All agent data erased.",
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
  return (
    <article className="agent-result">
      <div className="agent-section-title">
        <h4>{run.title}</h4>
        <span className={`agent-status ${run.status}`}>{run.status}</span>
      </div>
      <small>
        {run.connection.model} · {run.calls}/8 model calls
      </small>
      {run.status === "running" && (
        <p role="status">Working… actions will appear below.</p>
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
      {run.citations.map((c) => (
        <button
          className="agent-citation"
          key={c.id}
          onClick={() => onCitation(c)}
        >
          [{c.id}] {c.sourceName} · p. {c.page}
        </button>
      ))}
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
          <button
            className="secondary-button"
            onClick={() => onSave({ ...a, id: a.id })}
          >
            Save to Studio
          </button>
        </details>
      ))}
      <details>
        <summary>Action history ({run.steps.length})</summary>
        <ol className="agent-steps">
          {run.steps.map((s, i) => (
            <li key={i}>
              <strong>{s.tool}</strong>
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
          notebook memory/plan and accumulated tool results are sent with each
          call. Retrieved passages are listed below. Generated assistant tool
          calls and prior replies are also sent on subsequent calls.
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
