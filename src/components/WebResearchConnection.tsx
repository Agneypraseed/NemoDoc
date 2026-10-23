import { useEffect, useId, useState } from "react";
import { apiJSON } from "../lib/api";
import {
  webProvider,
  webProviders,
  type WebProvider,
  type PublicWebConnection,
} from "../web-research-types";

const endpoint = "/api/agent/workspace/web-connection";
const connectionEvent = "nemodoc:web-connection";
export function WebResearchConnection() {
  const instanceId = useId();
  const [connection, setConnection] = useState<PublicWebConnection>();
  const [provider, setProvider] = useState<WebProvider>("tavily");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const sync = (event: Event) => {
      const { id, value } = (
        event as CustomEvent<{ id: string; value: PublicWebConnection }>
      ).detail;
      if (id === instanceId) return;
      setConnection(value);
      if (!key) setProvider(value.provider);
      setNotice("");
      setError("");
    };
    window.addEventListener(connectionEvent, sync);
    return () => window.removeEventListener(connectionEvent, sync);
  }, [instanceId, key]);
  const publish = (value: PublicWebConnection) => {
    setConnection(value);
    window.dispatchEvent(
      new CustomEvent(connectionEvent, { detail: { id: instanceId, value } }),
    );
  };
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void apiJSON<PublicWebConnection>(endpoint, undefined, controller.signal)
      .then((value) => {
        setConnection(value);
        setProvider(value.provider || "tavily");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [reload]);
  const saved =
    provider === connection?.provider
      ? connection
      : connection?.providers?.find((p) => p.id === provider);
  const act = async (clear = false) => {
    setBusy(true);
    setNotice("");
    setError("");
    let stored = false;
    try {
      const updated = await apiJSON<PublicWebConnection>(endpoint, {
        provider,
        apiKey: key,
        clearApiKey: clear,
      });
      publish(updated);
      setKey("");
      stored = true;
      if (clear) setNotice(`${webProviders[provider].name} disconnected.`);
      else {
        const tested = await apiJSON<PublicWebConnection>(
          `${endpoint}/test`,
          {},
        );
        if (tested.provider !== provider)
          throw new Error("The provider changed. Select it and test again.");
        publish(tested);
        setNotice(`${webProviders[provider].name} connected.`);
      }
    } catch (e) {
      setError((stored && !clear ? "Key saved. " : "") + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="agent-form web-search-settings"
      aria-label="Web research connection"
    >
      <h4>Web search</h4>
      {!connection && !error && <p role="status">Loading search settings…</p>}
      {connection && (
        <>
          <label className="field-label">
            Provider
            <select
              aria-label="Search provider"
              value={provider}
              disabled={busy}
              onChange={(e) => {
                setProvider(e.target.value as WebProvider);
                setKey("");
                setNotice("");
                setError("");
              }}
            >
              {webProvider.options.map((id) => (
                <option key={id} value={id}>
                  {webProviders[id].name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            API key
            <input
              aria-label="Search API key"
              type="password"
              autoComplete="new-password"
              maxLength={2048}
              value={key}
              disabled={busy}
              placeholder={
                saved?.hasApiKey
                  ? "Key saved · leave blank to keep"
                  : "Enter API key"
              }
              onChange={(e) => {
                setKey(e.target.value);
                setNotice("");
              }}
            />
          </label>
          <div className="search-key-help">
            <a
              href={webProviders[provider].keyURL}
              target="_blank"
              rel="noreferrer"
            >
              Get an API key
            </a>
          </div>
          <div className="agent-actions">
            <button
              type="button"
              className="primary-button"
              disabled={busy || (!key.trim() && !saved?.hasApiKey)}
              onClick={() => void act()}
            >
              {busy ? "Connecting…" : "Save & test search"}
            </button>
            {saved?.hasApiKey && (
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void act(true)}
              >
                Disconnect search
              </button>
            )}
          </div>
          <p className="field-hint">
            Testing runs one search and reads one public page.
          </p>
        </>
      )}
      {(notice ||
        (provider === connection?.provider &&
          connection.tested &&
          !key &&
          !error)) && (
        <p role="status" className="form-success">
          {notice || `${webProviders[provider].name} connected.`}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!connection && error && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => setReload((n) => n + 1)}
        >
          Retry
        </button>
      )}
    </section>
  );
}
