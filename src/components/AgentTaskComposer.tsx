import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileText, Globe, Play, Settings2 } from "lucide-react";
import { apiJSON } from "../lib/api";
import { agentFileLimit, type AgentFile } from "../agent-file-types";
import type {
  AgentChannel,
  AgentConnections,
  AgentSkill,
  AgentTask,
} from "../agent-types";
import type { PublicWebConnection } from "../web-research-types";
import "./agent-workspace.css";

type TaskDraft = Omit<AgentTask, "id" | "status" | "connection" | "createdAt">;

export function AgentTaskComposer({
  notebookId,
  active,
  skills,
  sources,
  files,
  web,
  busy,
  onSubmit,
  onUpload,
  onSources,
  onSettings,
}: {
  notebookId: string;
  active: boolean;
  skills: AgentSkill[];
  sources: { id: string; name: string }[];
  files: AgentFile[];
  web?: PublicWebConnection;
  busy: boolean;
  onSubmit: (draft: TaskDraft) => Promise<boolean>;
  onUpload: (file: File) => Promise<AgentFile | undefined>;
  onSources: () => void;
  onSettings: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [allowDelegation, setDelegation] = useState(false);
  const [researcher, setResearcher] = useState("");
  const [webResearcher, setWebResearcher] = useState("");
  const [selected, setSelected] = useState(() => sources.map((s) => s.id));
  const previousSourceIds = useRef(new Set(sources.map((s) => s.id)));
  const sourceOptions = useRef<HTMLDetailsElement>(null);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [allowWeb, setAllowWeb] = useState(false);
  const [webRevision, setWebRevision] = useState<string>();
  const [allowFileWrites, setFileWrites] = useState(false);
  const [allowMemory, setMemory] = useState(false);
  const [allowSchedule, setSchedule] = useState(false);
  const [title, setTitle] = useState("");
  const [skillId, setSkillId] = useState(
    () =>
      skills.find((s) => s.id === "autonomous-tools")?.id ??
      skills[0]?.id ??
      "",
  );
  const [when, setWhen] = useState("");
  const [repeat, setRepeat] = useState<number | "weekdays">(0);
  const [weekdayTime, setWeekdayTime] = useState("08:00");
  const [timeZone, setTimeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [channels, setChannels] = useState<AgentChannel[]>([]);
  const [connections, setConnections] = useState<AgentConnections>();
  const [error, setError] = useState("");
  const webReady = !!web?.tested && !!web.hasApiKey;
  const selectedSources = selected.filter((id) =>
    sources.some((s) => s.id === id),
  );
  const selectedFiles = fileIds.filter((id) => files.some((f) => f.id === id));
  useEffect(() => {
    const current = new Set(sources.map((source) => source.id));
    const added = [...current].filter(
      (id) => !previousSourceIds.current.has(id),
    );
    if (added.length) setSelected((selected) => [...selected, ...added]);
    previousSourceIds.current = current;
  }, [sources]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void apiJSON<AgentConnections>(
      "/api/agent/connections",
      undefined,
      controller.signal,
    )
      .then(setConnections)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [notebookId, active]);
  const submit = async () => {
    setError("");
    const dueAt = when ? new Date(when).getTime() : Date.now();
    if (!Number.isFinite(dueAt)) {
      setError("Choose a valid start time.");
      return;
    }
    const ok = await onSubmit({
      notebookId,
      title: title.trim() || prompt.trim().slice(0, 100),
      prompt,
      skillId,
      instructions,
      allowDelegation,
      agentInstructions: allowDelegation
        ? { researcher, webResearcher }
        : undefined,
      sourceIds: selectedSources,
      fileIds: selectedFiles,
      dueAt,
      repeatHours: repeat === "weekdays" ? 0 : repeat,
      schedule:
        repeat === "weekdays"
          ? { kind: "weekdays", time: weekdayTime, timeZone }
          : undefined,
      allowWeb,
      webRevision: allowWeb ? webRevision : undefined,
      allowFileWrites,
      allowMemory,
      allowSchedule,
      channels,
      channelRevisions: Object.fromEntries(
        channels.map((c) => [c, connections?.[c].revision || ""]),
      ),
    });
    if (ok) {
      setPrompt("");
      setTitle("");
    }
  };
  return (
    <form
      className="agent-composer"
      aria-label="New agent task"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="agent-composer-main">
        <label className="field-label">
          What should I do?
          <textarea
            aria-label="What should I do?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            required
            maxLength={8000}
            placeholder="Ask a question, compare your sources, or research a topic…"
          />
        </label>
        <label className="field-label">
          Agent instructions
          <textarea
            aria-label="Agent instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={1}
            maxLength={5000}
            placeholder="How should the agent approach this? For example: explain simply, compare evidence, and keep the answer concise."
          />
        </label>
        <div
          className="agent-mode-picker"
          role="group"
          aria-label="How the agent works"
        >
          <button
            type="button"
            aria-pressed={!allowDelegation}
            onClick={() => setDelegation(false)}
          >
            One agent
          </button>
          <button
            type="button"
            aria-pressed={allowDelegation}
            onClick={() => setDelegation(true)}
          >
            Delegate as needed
          </button>
        </div>
        {allowDelegation && (
          <details
            className="agent-composer-options agent-specialist-options"
            open
          >
            <summary>
              <ChevronDown size={15} /> Specialist instructions
            </summary>
            <p className="agent-fine">
              The main agent can call up to four specialists with this task’s
              source access. It combines their cited findings into one answer.
            </p>
            <div className="agent-instruction-grid">
              <label className="field-label">
                Notebook researcher
                <textarea
                  aria-label="Notebook researcher"
                  rows={2}
                  maxLength={3000}
                  value={researcher}
                  onChange={(e) => setResearcher(e.target.value)}
                  placeholder="What should researchers focus on in your selected documents and files?"
                />
              </label>
              <label className="field-label">
                Web researcher
                <textarea
                  aria-label="Web researcher"
                  rows={2}
                  maxLength={3000}
                  value={webResearcher}
                  onChange={(e) => setWebResearcher(e.target.value)}
                  placeholder="Preferred sites, papers, dates, or questions to investigate…"
                />
                {!allowWeb && (
                  <small>
                    Enable public web access below to use this specialist.
                  </small>
                )}
              </label>
            </div>
          </details>
        )}
      </div>
      <div className="agent-composer-toolbar">
        <label className="check-field agent-web-toggle">
          <input
            type="checkbox"
            aria-label="Allow public web search and page reading"
            checked={allowWeb}
            disabled={!webReady && !allowWeb}
            onChange={(e) => {
              setAllowWeb(e.target.checked);
              setWebRevision(e.target.checked ? web?.revision : undefined);
            }}
          />
          <Globe size={15} /> Use public web
        </label>
        <button
          type="button"
          className="agent-source-toggle"
          onClick={() => {
            if (sourceOptions.current) sourceOptions.current.open = true;
            sourceOptions.current?.querySelector("summary")?.focus();
          }}
        >
          <FileText size={15} /> {selectedSources.length + selectedFiles.length}{" "}
          sources
        </button>
        <button
          className="primary-button"
          type="submit"
          disabled={
            busy ||
            !prompt.trim() ||
            (!selectedSources.length && !selectedFiles.length && !allowWeb) ||
            (allowWeb && (!webReady || webRevision !== web?.revision)) ||
            !skills.some((s) => s.id === skillId)
          }
        >
          <Play size={15} />
          {busy
            ? "Starting…"
            : when || repeat === "weekdays"
              ? "Schedule task"
              : "Run task"}
        </button>
      </div>
      {!webReady && (
        <p className="agent-composer-notice">
          To research websites and papers,{" "}
          <button type="button" className="text-button" onClick={onSettings}>
            connect a search provider
          </button>
          .
        </p>
      )}
      {allowWeb && webRevision !== web?.revision && (
        <p role="alert" className="form-error">
          Search settings changed. Turn web access off and on to approve the
          current connection.
        </p>
      )}
      <div className="agent-composer-settings">
        <details className="agent-composer-options" ref={sourceOptions}>
          <summary>
            <FileText size={15} /> Sources & files <ChevronDown size={14} />
          </summary>
          <fieldset>
            <legend>Sources for this task</legend>
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
            <button className="text-button" type="button" onClick={onSources}>
              Choose notebook sources
            </button>
          </fieldset>
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
                void onUpload(file).then((saved) => {
                  if (saved) setFileIds((ids) => [...ids, saved.id]);
                });
              }}
            />
          </label>
          {files.map((file) => (
            <label className="check-field" key={file.id}>
              <input
                type="checkbox"
                checked={fileIds.includes(file.id)}
                disabled={fileIds.length >= 20 && !fileIds.includes(file.id)}
                onChange={(e) =>
                  setFileIds(
                    e.target.checked
                      ? [...fileIds, file.id]
                      : fileIds.filter((id) => id !== file.id),
                  )
                }
              />
              {file.name} ·{" "}
              {file.origin === "agent" ? "generated file" : "uploaded file"}
            </label>
          ))}
          <p className="agent-fine">
            Only selected sources and files are shared with the model. Public
            search queries go to your search provider; retrieved page text goes
            to your model.
          </p>
        </details>
        <details className="agent-composer-options">
          <summary>
            <Settings2 size={15} /> Task settings <ChevronDown size={14} />
          </summary>
          <label className="field-label">
            Task name
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              placeholder="Named from your request if left blank"
            />
          </label>
          <label className="field-label">
            Reusable skill
            <select
              aria-label="Reusable skill"
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
            >
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={allowFileWrites}
              onChange={(e) => setFileWrites(e.target.checked)}
            />
            Allow new output files in this notebook’s agent workspace
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={allowMemory}
              onChange={(e) => setMemory(e.target.checked)}
            />
            Allow progress memory updates
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={allowSchedule}
              onChange={(e) => setSchedule(e.target.checked)}
            />
            Allow one follow-up review per run
          </label>
          <p className="agent-fine">
            Output files never overwrite originals. Specialists only read; the
            main agent performs permitted actions.
          </p>
        </details>
        <details className="agent-composer-options">
          <summary>
            Schedule & delivery <ChevronDown size={14} />
          </summary>
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
                />
              </label>
            </>
          )}
          <fieldset>
            <legend>Automatically deliver the completed answer</legend>
            {(["email", "whatsapp"] as const).map((channel) => (
              <label className="check-field" key={channel}>
                <input
                  type="checkbox"
                  checked={channels.includes(channel)}
                  disabled={
                    !connections?.[channel].recipient ||
                    (channel === "email"
                      ? !connections.email.hasPassword
                      : !connections.whatsapp.hasApiKey)
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
                {connections?.[channel].recipient ||
                  "a recipient configured in Connections"}
              </label>
            ))}
            <p className="agent-fine">
              Selecting a channel authorizes delivery after every successful
              run. Leave unchecked to preview and send manually.
            </p>
          </fieldset>
          <p className="agent-fine">
            Keep the local server running for scheduled tasks. Repeated tasks
            keep their saved provider and model.
          </p>
        </details>
      </div>
      <p className="agent-composer-disclosure">
        {allowDelegation
          ? "Up to 24 model calls across the team."
          : "Up to 8 model calls."}{" "}
        Instructions, notebook memory, and retrieved evidence are sent to your
        selected model. Activity and redacted traces are saved in this notebook.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
