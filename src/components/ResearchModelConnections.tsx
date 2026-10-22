import { useEffect, useState } from "react";
import { apiJSON } from "../lib/api";
import {
  researchCapabilities,
  researchCostTiers,
  routingPriorities,
  type ResearchProfile,
  type ResearchModelCatalog,
  type PublicResearchProfile,
} from "../research-model-types";

const root = "/api/agent/workspace/model-profiles";
const fresh = (): ResearchProfile => ({
  id: `model-${crypto.randomUUID()}`,
  name: "",
  baseUrl: "",
  model: "",
  capabilities: ["research"],
  costTier: "unspecified",
  strengths: "",
});
export function ResearchModelConnections() {
  const [catalog, setCatalog] = useState<ResearchModelCatalog>();
  const [draft, setDraft] = useState(fresh);
  const [key, setKey] = useState(""),
    [clearKey, setClearKey] = useState(false);
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [feedbackId, setFeedbackId] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void apiJSON<ResearchModelCatalog>(root, undefined, controller.signal)
      .then(setCatalog)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setNotice(e.message);
          setNoticeError(true);
        }
      });
    return () => controller.abort();
  }, []);
  const act = async (endpoint: string, body: unknown) => {
    setBusy(true);
    setNotice("");
    setNoticeError(false);
    setFeedbackId(
      endpoint === "/test" && body && typeof body === "object" && "id" in body
        ? String(body.id)
        : "",
    );
    try {
      const result = await apiJSON<ResearchModelCatalog>(root + endpoint, body);
      setCatalog(result);
      setNotice(
        endpoint === "/test"
          ? "Model tool-call and result round trip passed."
          : "Research model settings saved.",
      );
      return true;
    } catch (error) {
      setNotice((error as Error).message);
      setNoticeError(true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const edit = (p: PublicResearchProfile) => {
    const { tested: _tested, hasApiKey: _hasKey, ...profile } = p;
    setDraft(profile);
    setKey("");
    setClearKey(false);
    setEditing(true);
  };
  return (
    <section className="agent-form" aria-label="Research model connections">
      <h4>Research models & task routing</h4>
      <p>
        Add models for planning, mathematical reasoning, research and critical
        review. The planner chooses from tested profiles for each task; you can
        override its choices before starting. Strengths and cost tiers are your
        routing hints, not measured quality or live prices.
      </p>
      {!!notice && !feedbackId && (
        <p
          className={noticeError ? "form-error" : "form-success"}
          role={noticeError ? "alert" : "status"}
        >
          {notice}
        </p>
      )}
      {catalog?.profiles.map((p) => (
        <article
          key={p.id}
          className="agent-form"
          aria-label={`Research model ${p.name}`}
        >
          <strong>{p.name}</strong>
          <p>
            <code>{p.model}</code> · {p.tested ? "Ready" : "Not tested"}
          </p>
          <p>
            {p.capabilities.join(", ")} · {p.costTier}
          </p>
          {p.id !== "default" && (
            <div className="agent-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => edit(p)}
              >
                Edit model
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void act("/test", { id: p.id })}
              >
                Test model
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void act("/remove", { id: p.id })}
              >
                Remove model
              </button>
            </div>
          )}
          {p.id === feedbackId && !!notice && (
            <p
              className={noticeError ? "form-error" : "form-success"}
              role={noticeError ? "alert" : "status"}
            >
              {notice}
            </p>
          )}
        </article>
      ))}
      <button
        type="button"
        className="secondary-button"
        disabled={busy}
        onClick={() => {
          setDraft(fresh());
          setKey("");
          setClearKey(false);
          setEditing(true);
        }}
      >
        Add research model
      </button>
      {editing && (
        <form
          aria-label="Research model profile"
          onSubmit={(e) => {
            e.preventDefault();
            void act("", { ...draft, apiKey: key, clearApiKey: clearKey }).then(
              (ok) => {
                if (ok) {
                  setEditing(false);
                  setKey("");
                }
              },
            );
          }}
        >
          <label className="field-label">
            Profile name
            <input
              required
              maxLength={100}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field-label">
            API base URL
            <input
              required
              type="url"
              placeholder="https://provider.example/v1"
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            />
          </label>
          <label className="field-label">
            Model ID
            <input
              required
              maxLength={200}
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </label>
          <label className="field-label">
            Model API key
            <input
              type="password"
              autoComplete="off"
              value={key}
              placeholder={
                catalog?.profiles.find((p) => p.id === draft.id)?.hasApiKey
                  ? "Saved key · enter to replace"
                  : "API key (optional for local endpoints)"
              }
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={clearKey}
              onChange={(e) => setClearKey(e.target.checked)}
            />
            Clear saved model key
          </label>
          <fieldset>
            <legend>Declared capabilities</legend>
            {researchCapabilities.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={draft.capabilities.includes(c)}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      capabilities: draft.capabilities.includes(c)
                        ? draft.capabilities.filter((v) => v !== c)
                        : [...draft.capabilities, c],
                    })
                  }
                />
                {c}
              </label>
            ))}
          </fieldset>
          <label className="field-label">
            Cost tier
            <select
              aria-label="Cost tier"
              value={draft.costTier}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  costTier: e.target.value as ResearchProfile["costTier"],
                })
              }
            >
              {researchCostTiers.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Strengths & routing notes
            <textarea
              maxLength={600}
              rows={2}
              value={draft.strengths}
              onChange={(e) =>
                setDraft({ ...draft, strengths: e.target.value })
              }
            />
          </label>
          <p>
            Saving resets the test status. Testing makes two model requests to
            verify a tool-call/result round trip. Changing provider origin
            clears the old key unless you enter a new one.
          </p>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || !draft.capabilities.length}
          >
            Save research model
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setKey("");
            }}
          >
            Cancel model edit
          </button>
        </form>
      )}
      {catalog && (
        <form
          aria-label="Research routing preferences"
          onSubmit={(e) => {
            e.preventDefault();
            void act("/preferences", {
              plannerProfileId: catalog.plannerProfileId,
              priority: catalog.priority,
            });
          }}
        >
          <label className="field-label">
            Planner model
            <select
              aria-label="Planner model"
              value={catalog.plannerProfileId}
              onChange={(e) =>
                setCatalog({ ...catalog, plannerProfileId: e.target.value })
              }
            >
              {catalog.profiles.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.tested}>
                  {p.name} · {p.model}
                  {p.tested ? "" : " (test required)"}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Routing priority
            <select
              aria-label="Routing priority"
              value={catalog.priority}
              onChange={(e) =>
                setCatalog({
                  ...catalog,
                  priority: e.target.value as ResearchModelCatalog["priority"],
                })
              }
            >
              {routingPriorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="secondary-button" disabled={busy}>
            Save routing preferences
          </button>
        </form>
      )}
    </section>
  );
}
