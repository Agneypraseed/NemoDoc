import { useEffect, useState } from "react";
import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { apiJSON } from "../lib/api";
import type { ConnectionSettings as Settings } from "../types";

export function ConnectionSettings({ onSaved }: { onSaved: () => void }) {
  const [settings, setSettings] = useState<Settings>();
  const [key, setKey] = useState(""),
    [clearKey, setClearKey] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [models, setModels] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    apiJSON<Settings>("/api/settings", undefined, controller.signal)
      .then(setSettings)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const save = async (test: boolean) => {
    if (!settings) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await apiJSON<Settings>("/api/settings", {
        ...settings,
        apiKey: key,
        clearApiKey: clearKey,
      });
      setSettings(updated);
      setKey("");
      setClearKey(false);
      onSaved();
      if (test) {
        const result = await apiJSON<{ latencyMs: number }>(
          "/api/settings/test",
          {},
        );
        setMessage(`Connected successfully · ${result.latencyMs} ms`);
      } else setMessage("Connection saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!settings) return <p role="status">{error || "Loading connection…"}</p>;
  const field = (name: keyof Settings, label: string) => (
    <label className="field-label">
      {label}
      <input
        value={String(settings[name])}
        disabled={busy}
        onChange={(e) => setSettings({ ...settings, [name]: e.target.value })}
      />
    </label>
  );
  const local = /^http:\/\//.test(settings.baseUrl);
  const nebius = new URL(settings.baseUrl).hostname.includes("tokenfactory");
  const preset = (kind: "nebius" | "nvidia" | "local") => {
    setModels([]);
    setKey("");
    setMessage("");
    const base =
      kind === "nebius"
        ? "https://api.tokenfactory.nebius.com/v1"
        : kind === "nvidia"
          ? "https://integrate.api.nvidia.com/v1"
          : "http://127.0.0.1:8000/v1";
    setSettings({
      ...settings,
      baseUrl: base,
      embeddingBaseUrl: kind === "local" ? "http://127.0.0.1:8001/v1" : base,
      visionBaseUrl: kind === "local" ? "http://127.0.0.1:8002/v1" : base,
      model:
        kind === "nebius"
          ? "nvidia/Nemotron-3_5-Lightning"
          : "nvidia/nemotron-3-nano-30b-a3b",
      embeddingModel:
        kind === "nebius"
          ? "Qwen/Qwen3-Embedding-0.6B"
          : "nvidia/llama-nemotron-embed-1b-v2",
      rerankUrl:
        kind === "nebius"
          ? base + "/rerank"
          : kind === "nvidia"
            ? "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking"
            : "http://127.0.0.1:8003/v1/ranking",
      semantic: false,
      rerank: false,
      hasApiKey:
        new URL(settings.baseUrl).host === new URL(base).host &&
        settings.hasApiKey,
    });
  };
  return (
    <div className="connection-form">
      <p className="modal-description">
        Choose where your NVIDIA model runs. Nebius Token Factory supports the
        hackathon runtime requirement; NVIDIA offers free prototyping access,
        and local inference uses your hardware.
      </p>
      <div className="segmented connection-modes">
        <button
          className={nebius ? "active" : ""}
          disabled={busy}
          onClick={() => preset("nebius")}
        >
          Nebius
        </button>
        <button
          className={!local && !nebius ? "active" : ""}
          disabled={busy}
          onClick={() => preset("nvidia")}
        >
          NVIDIA hosted
        </button>
        <button
          className={local ? "active" : ""}
          disabled={busy}
          onClick={() => preset("local")}
        >
          Local inference
        </button>
      </div>
      {field("baseUrl", "Chat API base URL")}
      {field("model", "Chat model ID")}
      <button
        className="secondary-button"
        disabled={busy}
        onClick={async () => {
          setError("");
          try {
            const data = await apiJSON<{ models: string[] }>("/api/models");
            setModels(data.models);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Load saved provider’s model catalog
      </button>
      {!!models.length && (
        <label className="field-label">
          Available model IDs
          <select
            value={models.includes(settings.model) ? settings.model : ""}
            onChange={(e) =>
              setSettings({ ...settings, model: e.target.value })
            }
          >
            <option value="" disabled>
              Select a model
            </option>
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="modal-description">
        Save the provider and key before loading its catalog. Choose an NVIDIA
        Nemotron model with tool calling for the agent. Availability is
        account-specific. A different host needs its own key.
      </p>
      <label className="field-label">
        API key
        <input
          type="password"
          autoComplete="new-password"
          placeholder={
            settings.hasApiKey
              ? "Key saved · leave blank to keep"
              : "Provider key (optional for local inference)"
          }
          value={key}
          disabled={busy}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      {settings.hasApiKey && (
        <label className="check-field">
          <input
            type="checkbox"
            checked={clearKey}
            disabled={busy}
            onChange={(e) => setClearKey(e.target.checked)}
          />
          Remove saved API key
        </label>
      )}
      <label className="check-field">
        <input
          type="checkbox"
          checked={settings.semantic}
          disabled={busy}
          onChange={(e) =>
            setSettings({ ...settings, semantic: e.target.checked })
          }
        />
        Use semantic retrieval for chat and study tools
      </label>
      <details>
        <summary>Embeddings, vision, and reranking</summary>
        <p className="modal-description">
          These models must be offered by the saved provider. Select exact IDs
          from its catalog. Keyword retrieval works without embedding or
          reranking models; vision and OCR need a model that accepts images.
        </p>
        {field("embeddingBaseUrl", "Embedding API base URL")}
        {field("embeddingModel", "Embedding model ID")}
        {field("visionBaseUrl", "Vision API base URL")}
        {field("visionModel", "Vision model ID")}
        <label className="check-field">
          <input
            type="checkbox"
            checked={settings.rerank}
            disabled={busy}
            onChange={(e) =>
              setSettings({ ...settings, rerank: e.target.checked })
            }
          />
          Rerank semantic results
        </label>
        {field("rerankUrl", "Reranking endpoint URL")}
        {field("rerankModel", "Reranking model ID")}
      </details>
      <div className="privacy-note">
        <ShieldCheck size={19} />
        <p>
          Keys stay on this local server in an ignored settings file. Hosted
          requests send selected text or page images to the chosen provider.
          Notebook backups contain your notebooks, never credentials.
        </p>
      </div>
      <p className="modal-description">
        {nebius ? (
          <>
            Nebius uses paid inference or limited promotional credits.{" "}
            <a
              href="https://nebius.com/builders-terms-and-conditions"
              target="_blank"
              rel="noreferrer"
            >
              Builder credit terms
            </a>
          </>
        ) : local ? (
          <>
            Local open weights have no hosted per-token fee; hardware and
            model/runtime license terms still apply. Start your compatible
            inference server separately.
          </>
        ) : (
          <>
            NVIDIA Developer Program endpoints are free for prototyping, subject
            to availability and limits.{" "}
            <a
              href="https://docs.api.nvidia.com/nim/docs/product"
              target="_blank"
              rel="noreferrer"
            >
              Access and license terms
            </a>
          </>
        )}
      </p>
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
      <div className="modal-actions">
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void save(false)}
        >
          Save connection
        </button>
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void save(true)}
        >
          {busy && <LoaderCircle size={15} className="spin" />}Save & test
        </button>
      </div>
    </div>
  );
}
