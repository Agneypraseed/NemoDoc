import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileText,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiJSON } from "../lib/api";
import { download } from "../lib/storage";
import { MarkdownFileInput } from "./MarkdownFileInput";
import {
  applyRoleTemplate,
  modelRoutingInput,
  roleTemplates,
  type AgentConfiguration as Configuration,
  type AgentRoleFile,
  type ManagedAgent,
  type RoleFileName,
  type AgentRoleDrafts,
} from "../agent-config-types";

const root = "/api/agent/manage";
export function AgentConfiguration({
  initialAgentId,
  onConnections,
  drafts,
}: {
  initialAgentId?: string;
  onConnections: () => void;
  drafts: AgentRoleDrafts;
}) {
  const [configuration, setConfiguration] = useState<Configuration>();
  const [generation, setGeneration] = useState(0);
  const [selected, setSelected] = useState(initialAgentId || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [newName, setNewName] = useState("");
  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      setConfiguration(await apiJSON<Configuration>(root));
      setGeneration((value) => value + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void apiJSON<Configuration>(root, undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setConfiguration(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const agent =
    configuration?.agents.find((a) => a.id === selected) ||
    configuration?.agents[0];
  const create = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiJSON<{
        ok: boolean;
        agentId: string;
        message: string;
      }>(root + "/create", { name: newName });
      setSelected(result.agentId);
      setNewName("");
      if (result.ok) setMessage(result.message);
      else setError(result.message);
      const value = await apiJSON<Configuration>(root);
      setConfiguration(value);
      setGeneration((value) => value + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="agent-configuration" aria-label="Agent configuration">
      <div className="agent-section-title">
        <h3>
          <Settings2 size={16} />
          Agent settings
        </h3>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={13} />
          Reload agents
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
      {!configuration && !error && (
        <p role="status">Loading agent configuration…</p>
      )}
      {configuration && !configuration.available && (
        <div className="agent-empty">
          <Settings2 size={24} />
          <h4>Agent configuration needs your runtime host</h4>
          <p>{configuration.message}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={onConnections}
          >
            Open connections
          </button>
          <details>
            <summary>Runtime setup details</summary>
            <p>
              On the runtime host, set <code>NEMODOC_NEMOCLAW_SANDBOX</code> to
              your sandbox name and make the NemoClaw CLI available to the
              server.
            </p>
          </details>
        </div>
      )}
      {configuration?.available && (
        <>
          <details
            className="agent-create-details"
            open={!configuration.agents.length}
          >
            <summary>
              <Plus size={14} /> Add an agent
            </summary>
            <form
              className="agent-form agent-create-form"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label className="field-label">
                New agent name
                <input
                  aria-label="New agent name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={32}
                  placeholder="Research reviewer"
                  required
                  pattern="[A-Za-z][A-Za-z0-9 _-]*"
                />
              </label>
              <button className="secondary-button" disabled={busy}>
                <Plus size={13} />
                Create agent
              </button>
              <p className="agent-monitor-caption">
                Creates a separate workspace. Start with a letter and use up to
                32 letters, numbers, spaces, hyphens or underscores.
              </p>
            </form>
          </details>
          {configuration.catalogError && (
            <p role="status" className="agent-fine">
              {configuration.catalogError}
            </p>
          )}
          {agent ? (
            <>
              <label className="field-label">
                Configure agent
                <select
                  aria-label="Configure agent"
                  value={agent.id}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setError("");
                    setMessage("");
                  }}
                >
                  {configuration.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.id}
                    </option>
                  ))}
                </select>
              </label>
              <AgentEditor
                key={`${agent.id}:${agent.revision}:${generation}`}
                agent={agent}
                configuration={configuration}
                drafts={drafts}
                onConnections={onConnections}
                onReload={() => void refresh()}
              />
            </>
          ) : (
            <p className="agent-fine">
              Create your first agent to assign a role and model.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function AgentEditor({
  agent,
  configuration,
  onConnections,
  onReload,
  drafts,
}: {
  agent: ManagedAgent;
  configuration: Configuration;
  onConnections: () => void;
  onReload: () => void;
  drafts: AgentRoleDrafts;
}) {
  const [primary, setPrimary] = useState(agent.primary),
    [fallbacks, setFallbacks] = useState(agent.fallbacks);
  const [section, setSection] = useState<
    "instructions" | "models" | "advanced"
  >("instructions");
  const [nextFallback, setNextFallback] = useState("");
  const [name, setName] = useState(agent.name);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [modelsSaved, setModelsSaved] = useState(false);
  const [exactMode, setExactMode] = useState(
    !!agent.primary &&
      !configuration.models.some((m) => m.id === agent.primary),
  );
  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="agent-editor" aria-label={`${agent.name} settings`}>
      <nav className="agent-settings-tabs" aria-label="Agent settings sections">
        {(["instructions", "models", "advanced"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={section === value}
            onClick={() => setSection(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </nav>
      <div className="agent-editing-identity">
        <div>
          <strong>{agent.name}</strong>
          <span>{agent.id}</span>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() =>
            void act(
              () => apiJSON(root + "/select", { agentId: agent.id }),
              "Agent selected. Test the gateway connection before running tasks.",
            ).then((ok) => {
              if (ok) onConnections();
            })
          }
        >
          Use this agent in NemoDoc
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
      <div hidden={section !== "instructions"}>
        <RoleEditor agentId={agent.id} drafts={drafts} />
      </div>
      <div hidden={section !== "advanced"}>
        <form
          className="agent-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              () => apiJSON(root + "/name", { agentId: agent.id, name }),
              "Agent name saved in OpenClaw.",
            );
          }}
        >
          <h4>Identity</h4>
          <label className="field-label">
            Agent display name
            <input
              aria-label="Agent display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              pattern="[A-Za-z0-9][A-Za-z0-9 _-]*"
            />
          </label>
          <button className="secondary-button" disabled={busy}>
            Save name
          </button>
        </form>
      </div>
      <div hidden={section !== "models"}>
        <form
          className="agent-form"
          id={`agent-models-${agent.id}`}
          onSubmit={(e) => {
            e.preventDefault();
            const input = {
              agentId: agent.id,
              primary,
              fallbacks,
              revision: agent.revision,
            };
            if (!modelRoutingInput.safeParse(input).success) {
              setError(
                "Choose distinct provider/model IDs, or inherit the runtime default without overrides.",
              );
              return;
            }
            void act(
              () => apiJSON(root + "/models", input),
              "Model routing saved. The gateway may reload. Reload agents to verify the applied models before editing them again.",
            ).then((ok) => {
              if (ok) setModelsSaved(true);
            });
          }}
        >
          <h4>Model routing</h4>
          <p className="agent-monitor-caption">
            Each agent can use a different model. Fallbacks are tried in order
            when the primary cannot serve a request.
          </p>
          <label className="field-label">
            Primary model
            <select
              aria-label="Primary model"
              value={exactMode ? "__exact__" : primary}
              onChange={(e) => {
                setExactMode(e.target.value === "__exact__");
                setPrimary(
                  e.target.value === "__exact__"
                    ? agent.primary || "nvidia/"
                    : e.target.value,
                );
                if (!e.target.value) setFallbacks([]);
              }}
              disabled={busy || modelsSaved}
            >
              <option value="">Inherit runtime default</option>
              {configuration.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.provider}
                  {m.available === false
                    ? " (credentials/availability need checking)"
                    : ""}
                  {m.supportsTools === false
                    ? " (no tool support reported)"
                    : ""}
                </option>
              ))}
              <option value="__exact__">
                Enter an exact provider/model ID…
              </option>
            </select>
          </label>
          {exactMode && (
            <label className="field-label">
              Exact primary model ID
              <input
                aria-label="Exact primary model ID"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                disabled={busy || modelsSaved}
                placeholder="provider/model-id"
              />
            </label>
          )}
          <ol className="agent-fallback-list" aria-label="Fallback models">
            {fallbacks.map((model, i) => (
              <li key={`${i}-${model}`}>
                <span>{model}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move fallback ${i + 1} up`}
                  disabled={i === 0 || busy || modelsSaved}
                  onClick={() =>
                    setFallbacks((values) => {
                      const copy = [...values];
                      [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                      return copy;
                    })
                  }
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move fallback ${i + 1} down`}
                  disabled={i === fallbacks.length - 1 || busy || modelsSaved}
                  onClick={() =>
                    setFallbacks((values) => {
                      const copy = [...values];
                      [copy[i + 1], copy[i]] = [copy[i], copy[i + 1]];
                      return copy;
                    })
                  }
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove fallback ${i + 1}`}
                  disabled={busy || modelsSaved}
                  onClick={() =>
                    setFallbacks((values) => values.filter((_, at) => at !== i))
                  }
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ol>
          <label className="field-label">
            Fallback model ID
            <input
              aria-label="Fallback model ID"
              value={nextFallback}
              onChange={(e) => setNextFallback(e.target.value)}
              list={`agent-model-options-${agent.id}`}
              placeholder="provider/model-id"
              disabled={
                !primary || busy || modelsSaved || fallbacks.length >= 5
              }
            />
            <datalist id={`agent-model-options-${agent.id}`}>
              {configuration.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </datalist>
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={
              !primary ||
              !nextFallback.trim() ||
              busy ||
              modelsSaved ||
              fallbacks.length >= 5
            }
            onClick={() => {
              const model = nextFallback.trim();
              if (model === primary || fallbacks.includes(model)) {
                setError("Primary and fallback models must be different.");
                return;
              }
              setFallbacks((values) => [...values, model]);
              setNextFallback("");
            }}
          >
            Add fallback
          </button>{" "}
          <button className="primary-button" disabled={busy || modelsSaved}>
            <Save size={13} />
            Save model routing
          </button>
          {modelsSaved && (
            <button type="button" className="text-button" onClick={onReload}>
              Reload applied models
            </button>
          )}
          <p className="agent-monitor-caption">
            Provider credentials and allowed inference routes stay in NemoClaw.
            The runtime validates model IDs; saving does not prove model
            availability.
          </p>
        </form>
      </div>
      <div hidden={section !== "advanced"}>
        <div className="agent-form">
          <h4>Runtime permissions</h4>
          <p className="agent-fine">
            Markdown describes the role. Tool and sandbox policies enforce
            permissions separately.
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void act(
                () => apiJSON(root + "/restrict", { agentId: agent.id }),
                "NemoDoc tool restrictions applied. The gateway may reload.",
              )
            }
          >
            Apply NemoDoc tool restrictions
          </button>
        </div>
        <p className="agent-fine">
          Changes to NemoDoc’s selected agent pause its tasks and invalidate
          earlier workflow approvals.{" "}
          <button type="button" className="text-button" onClick={onConnections}>
            Test its connection again
          </button>{" "}
          before running new work.
        </p>
        <p className="agent-fine">
          Runtime: {configuration.sandbox || "configured runtime"} ·{" "}
          {configuration.message}
        </p>
      </div>
    </div>
  );
}

function RoleEditor({
  agentId,
  drafts,
}: {
  agentId: string;
  drafts: AgentRoleDrafts;
}) {
  const [filename, setFilename] = useState<RoleFileName>("AGENTS.md");
  const [file, setFile] = useState<AgentRoleFile>();
  const [content, setContent] = useState("");
  const [template, setTemplate] =
    useState<keyof typeof roleTemplates>("Study coach");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [discard, setDiscard] = useState<RoleFileName | "reload" | null>(null);
  const [reload, setReload] = useState(0);
  const dirty = !!file && content !== file.content;
  const draftKey = `${agentId}:${filename}`;
  const updateContent = (value: string | ((old: string) => string)) =>
    setContent((old) => {
      const next = typeof value === "function" ? value(old) : value;
      if (file && next !== file.content)
        drafts.set(draftKey, { content: next, revision: file.revision });
      else drafts.delete(draftKey);
      return next;
    });
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setMessage("");
    setFile(undefined);
    setContent("");
    setPreview(false);
    void apiJSON<AgentRoleFile>(
      `${root}/file?agentId=${encodeURIComponent(agentId)}&name=${filename}`,
      undefined,
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          const draft = drafts.get(draftKey);
          setFile({ ...value, revision: draft?.revision || value.revision });
          setContent(draft?.content ?? value.content);
          if (draft && draft.revision !== value.revision)
            setError(
              "Your draft is preserved, but the runtime file changed. Compare it with the current file before saving; download the draft before reloading.",
            );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [agentId, filename, reload, drafts, draftKey]);
  const change = (target: RoleFileName | "reload") => {
    if (dirty) {
      setDiscard(target);
      return;
    }
    if (target === "reload") setReload((v) => v + 1);
    else setFilename(target);
  };
  return (
    <section
      className="agent-form agent-role-editor"
      id={`agent-role-${agentId}`}
      aria-label="Markdown role files"
    >
      <h4>
        <FileText size={15} />
        Instructions
      </h4>
      <p className="agent-monitor-caption">
        <strong>AGENTS.md</strong> for instructions; <strong>SOUL.md</strong>{" "}
        for tone. Saved files apply to new sessions.
      </p>
      <div className="agent-monitor-filters" aria-label="Role file selection">
        {(["AGENTS.md", "SOUL.md"] as const).map((name) => (
          <button
            key={name}
            type="button"
            disabled={busy}
            aria-pressed={filename === name}
            onClick={() => change(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {discard && (
        <div role="alert" className="agent-config-discard">
          <p>Discard unsaved changes to {filename}?</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const target = discard;
              drafts.delete(draftKey);
              setDiscard(null);
              if (target === "reload") setReload((v) => v + 1);
              else setFilename(target);
            }}
          >
            Discard changes
          </button>{" "}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setDiscard(null)}
          >
            Keep editing
          </button>
        </div>
      )}
      {error && !file && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {busy && !file && <p role="status">Loading {filename}…</p>}
      {!file && error && (
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => setReload((value) => value + 1)}
        >
          Reload role file
        </button>
      )}
      {file && (
        <>
          {file.missing && (
            <p className="agent-fine">
              This file does not exist yet. Saving creates it in this agent’s
              workspace.
            </p>
          )}
          {filename === "AGENTS.md" && (
            <details className="agent-role-template">
              <summary>Start from a template</summary>
              <label className="field-label">
                Role template
                <select
                  aria-label="Role template"
                  value={template}
                  onChange={(e) =>
                    setTemplate(e.target.value as keyof typeof roleTemplates)
                  }
                  disabled={busy}
                >
                  {Object.keys(roleTemplates).map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  updateContent((value) => applyRoleTemplate(value, template));
                  setPreview(false);
                }}
              >
                Insert role template
              </button>
              <p className="agent-monitor-caption">
                Updates only the marked NemoDoc role section. Other instructions
                are preserved.
              </p>
            </details>
          )}
          <MarkdownFileInput
            key={draftKey}
            name={filename}
            disabled={busy}
            onImport={(value) => {
              updateContent(value);
              setPreview(false);
              setMessage("");
            }}
          />
          <div className="agent-section-title">
            <span className="agent-monitor-caption">
              {dirty ? "Unsaved changes" : "Matches loaded file"} ·{" "}
              {content.length.toLocaleString()} / 32,000 characters
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => setPreview((v) => !v)}
            >
              {preview ? "Edit Markdown" : "Preview Markdown"}
            </button>
          </div>
          {preview ? (
            <div
              className="agent-markdown-preview"
              aria-label={`${filename} preview`}
            >
              <ReactMarkdown
                skipHtml
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ children }) => <span>{children}</span>,
                  img: ({ alt }) => <span>{alt || "Image omitted"}</span>,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <label className="field-label">
              {filename === "AGENTS.md"
                ? "Agent instructions"
                : "Personality & tone"}
              <textarea
                aria-label={`${filename} content`}
                className="agent-markdown-input"
                value={content}
                onChange={(e) => updateContent(e.target.value)}
                maxLength={32000}
                rows={15}
                placeholder={
                  filename === "AGENTS.md"
                    ? "Role, goals, output format and limits…"
                    : "Tone and communication preferences…"
                }
                spellCheck={false}
                disabled={busy}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="agent-instruction-actions">
            <button
              type="button"
              className="primary-button"
              disabled={busy || !dirty}
              onClick={async () => {
                setBusy(true);
                setError("");
                setMessage("");
                try {
                  const value = await apiJSON<AgentRoleFile>(root + "/file", {
                    agentId,
                    name: filename,
                    content,
                    revision: file.revision,
                  });
                  setFile(value);
                  setContent(value.content);
                  drafts.delete(draftKey);
                  setMessage(`${filename} saved. Applies to new sessions.`);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Save size={13} />
              Save {filename}
            </button>{" "}
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => change("reload")}
            >
              Reload file
            </button>{" "}
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                download(
                  new Blob([content], { type: "text/markdown;charset=utf-8" }),
                  `${agentId}-${filename}`,
                )
              }
            >
              <Download size={13} />
              Download draft
            </button>
          </div>
          {message && (
            <p role="status" className="form-success">
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
