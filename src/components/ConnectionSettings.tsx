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
  return (
    <div className="connection-form">
      <p className="modal-description">
        Use NVIDIA hosted APIs or your own running NIM endpoints. Each model can
        have a separate endpoint.
      </p>
      <div className="segmented connection-modes">
        <button
          className={!local ? "active" : ""}
          disabled={busy}
          onClick={() =>
            setSettings({
              ...settings,
              baseUrl: "https://integrate.api.nvidia.com/v1",
              embeddingBaseUrl: "https://integrate.api.nvidia.com/v1",
              visionBaseUrl: "https://integrate.api.nvidia.com/v1",
            })
          }
        >
          NVIDIA hosted
        </button>
        <button
          className={local ? "active" : ""}
          disabled={busy}
          onClick={() =>
            setSettings({
              ...settings,
              baseUrl: "http://127.0.0.1:8000/v1",
              embeddingBaseUrl: "http://127.0.0.1:8001/v1",
              visionBaseUrl: "http://127.0.0.1:8002/v1",
              rerankUrl: "http://127.0.0.1:8003/v1/ranking",
            })
          }
        >
          Local NIM
        </button>
      </div>
      {field("baseUrl", "Chat API base URL")}
      {field("model", "Chat model ID")}
      <label className="field-label">
        API key
        <input
          type="password"
          autoComplete="new-password"
          placeholder={
            settings.hasApiKey
              ? "Key saved · leave blank to keep"
              : "nvapi-… (optional for local NIM)"
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
          requests send selected text or page images to NVIDIA. Backups contain
          your notebooks, never credentials.
        </p>
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
