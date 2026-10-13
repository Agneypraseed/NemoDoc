import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { apiJSON } from "../lib/api";
import { modelName } from "../lib/appearance";
import { modelModality, modelOptionLabel } from "../lib/model-modality";
import type { ConnectionSettings as Settings } from "../types";

export function ConnectionSettings({ onSaved }: { onSaved: () => void }) {
  const [settings, setSettings] = useState<Settings>();
  const [key, setKey] = useState(""),
    [clearKey, setClearKey] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [visionModels, setVisionModels] = useState<string[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<
    "idle" | "loading" | "loaded" | "unavailable"
  >("idle");
  useEffect(() => {
    const controller = new AbortController();
    apiJSON<Settings>("/api/settings", undefined, controller.signal)
      .then((loaded) => {
        setSettings(loaded);
        if (!loaded.hasApiKey && !/^http:\/\//.test(loaded.baseUrl)) return;
        setCatalogStatus("loading");
        apiJSON<{ models: string[] }>(
          "/api/models",
          undefined,
          controller.signal,
        )
          .then((data) => {
            setModels(data.models);
            setCatalogStatus("loaded");
          })
          .catch((e) => {
            if (e.name !== "AbortError") setCatalogStatus("unavailable");
          });
        apiJSON<{ models: string[] }>(
          "/api/models?capability=vision",
          undefined,
          controller.signal,
        )
          .then((data) => setVisionModels(data.models))
          .catch(() => {
            // Manual vision model entry remains available if the catalog fails.
          });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const save = async (test: boolean | "embeddings") => {
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
      if (test === "embeddings") {
        const result = await apiJSON<{ model: string }>(
          "/api/settings/test/embeddings",
          {},
        );
        setMessage(`Embeddings connected · ${result.model}`);
      } else if (test) {
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
    setVisionModels([]);
    setCatalogStatus("idle");
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
        kind === "nebius" ? "" : "nvidia/llama-nemotron-embed-1b-v2",
      visionModel:
        kind === "nebius"
          ? "openbmb/MiniCPM-V-4_5"
          : "nvidia/nemotron-nano-12b-v2-vl",
      rerankUrl:
        kind === "nebius"
          ? base + "/rerank"
          : kind === "nvidia"
            ? "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking"
            : "http://127.0.0.1:8003/v1/ranking",
      rerankModel: "",
      semantic: false,
      rerank: false,
      hasApiKey:
        new URL(settings.baseUrl).host === new URL(base).host &&
        settings.hasApiKey,
    });
  };
  return (
    <div className="connection-form">
      <h3>AI connection</h3>
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
      <label className="field-label">
        Chat & study model
        <select
          value={settings.model}
          disabled={busy}
          onChange={(e) => setSettings({ ...settings, model: e.target.value })}
        >
          {[...new Set([settings.model, ...models])].map((id) => (
            <option key={id} value={id}>
              {modelOptionLabel(id, modelName(id))}
            </option>
          ))}
        </select>
      </label>
      <p className="model-role-hint">
        {modelModality(settings.model) === "Vision"
          ? "Vision model selected for chat and study. Choose it separately for OCR & images below if this provider supports image input."
          : "Text model selected for chat, passage answers, summaries and study tools."}
      </p>
      <button
        className="secondary-button"
        disabled={busy}
        onClick={async () => {
          setError("");
          setCatalogStatus("loading");
          try {
            const data = await apiJSON<{ models: string[] }>("/api/models");
            setModels(data.models);
            setCatalogStatus("loaded");
          } catch (e) {
            setError((e as Error).message);
            setCatalogStatus("unavailable");
          }
        }}
      >
        {catalogStatus === "loading" ? "Loading models…" : "Refresh models"}
      </button>
      <p className="modal-description">
        {catalogStatus === "loaded"
          ? `${models.length} chat models available from this provider. Vision in the list means the model accepts images on a compatible endpoint.`
          : "Save your provider key, then refresh to see its available models. The current selection stays visible."}
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
      <section
        className="capability-settings"
        aria-label="Search and embeddings"
      >
        <h4>Search & embeddings</h4>
        <p className="modal-description">
          Search sources and your saved notes by meaning. Chat continues to use
          the chat model above; embeddings use a separate model.
        </p>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() =>
            setSettings({
              ...settings,
              embeddingBaseUrl: "http://127.0.0.1:11434/v1",
              embeddingModel: "embeddinggemma-2:270m",
            })
          }
        >
          Use EmbeddingGemma 2 locally
        </button>
        {/embeddinggemma/i.test(settings.embeddingModel) && (
          <p className="modal-description">
            Start Ollama with <code>ollama pull {settings.embeddingModel}</code>
            , then test the connection below.
          </p>
        )}
        {field("embeddingBaseUrl", "Embedding API base URL")}
        {field("embeddingModel", "Embedding model ID")}
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !settings.embeddingModel}
          onClick={() => void save("embeddings")}
        >
          {busy && <LoaderCircle size={15} className="spin" />}Save & test
          embeddings
        </button>
      </section>
      <section className="capability-settings" aria-label="OCR and images">
        <h4>OCR & images</h4>
        <p className="modal-description">
          Recognize scanned text and ask about diagrams with an image-capable
          model. This can be the same as chat when that model accepts images, or
          a separate vision model.
        </p>
        <div className="capability-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy || local}
            onClick={() => {
              setVisionModels([]);
              setSettings({
                ...settings,
                visionBaseUrl: settings.baseUrl,
                visionModel: nebius
                  ? "openbmb/MiniCPM-V-4_5"
                  : "nvidia/nemotron-nano-12b-v2-vl",
              });
            }}
          >
            Use provider vision model
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={async () => {
              setError("");
              try {
                const data = await apiJSON<{ models: string[] }>(
                  "/api/models?capability=vision",
                );
                setVisionModels(data.models);
                if (!data.models.length)
                  setError(
                    "No vision models were found in this provider's catalog. Enter a compatible model ID below.",
                  );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Browse vision models
          </button>
        </div>
        {field("visionBaseUrl", "Vision API base URL")}
        <label className="field-label">
          OCR & image model
          <select
            value={settings.visionModel}
            disabled={busy}
            onChange={(e) =>
              setSettings({ ...settings, visionModel: e.target.value })
            }
          >
            {[...new Set([settings.visionModel, ...visionModels])].map((id) => (
              <option key={id} value={id}>
                {id
                  ? modelOptionLabel(id, modelName(id))
                  : "Choose a vision model"}
              </option>
            ))}
          </select>
        </label>
        <details className="capability-custom-model">
          <summary>Enter a custom vision model ID</summary>
          {field("visionModel", "Vision model ID")}
        </details>
      </section>
      <details>
        <summary>Advanced capabilities</summary>
        {field("baseUrl", "Chat API base URL")}
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
      <p className="connection-disclosure">
        Your key stays on this device. Selected source content is sent to your
        provider when you use AI.
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
