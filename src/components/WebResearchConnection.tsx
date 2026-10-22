import { useEffect, useState } from "react";
import { apiJSON } from "../lib/api";

const endpoint = "/api/agent/workspace/web-connection";
export function WebResearchConnection() {
  const [connection, setConnection] = useState<{
    hasApiKey: boolean;
    tested: boolean;
  }>();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void apiJSON<{ hasApiKey: boolean; tested: boolean }>(
      endpoint,
      undefined,
      controller.signal,
    )
      .then(setConnection)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const act = async (action: "save" | "test" | "clear") => {
    setBusy(true);
    setNotice("");
    try {
      const result = await apiJSON<{ hasApiKey: boolean; tested: boolean }>(
        action === "test" ? `${endpoint}/test` : endpoint,
        action === "test"
          ? {}
          : { apiKey: key, clearApiKey: action === "clear" },
      );
      setConnection(result);
      setKey("");
      setNotice(
        action === "test"
          ? "Tavily connection test passed."
          : "Web connection saved.",
      );
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="agent-form" aria-label="Web research connection">
      <h4>Web research · Tavily</h4>
      <p>
        Search and read public pages during research. Notebook-only research
        works without a web connection. Testing makes one search request.
      </p>
      <label className="field-label">
        Tavily API key
        <input
          type="password"
          autoComplete="off"
          value={key}
          placeholder={
            connection?.hasApiKey
              ? "Saved key · enter to replace"
              : "Enter API key"
          }
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <div className="agent-actions">
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => void act("save")}
        >
          Save web connection
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !connection?.hasApiKey}
          onClick={() => void act("test")}
        >
          Test web connection
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !connection?.hasApiKey}
          onClick={() => void act("clear")}
        >
          Clear web key
        </button>
      </div>
      <p role="status">
        {notice ||
          (connection?.tested
            ? "Tavily connected"
            : "Save and test a key to enable web research.")}
      </p>
    </section>
  );
}
