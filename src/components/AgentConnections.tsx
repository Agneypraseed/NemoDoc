import { useEffect, useState } from "react";
import type { AgentConnections as Connections } from "../agent-types";
import { apiJSON } from "../lib/api";

export function AgentConnections() {
  const [data, setData] = useState<Connections>();
  const [keys, setKeys] = useState({ model: "", email: "", whatsapp: "" });
  const [clear, setClear] = useState({
    model: false,
    email: false,
    whatsapp: false,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void apiJSON<Connections>(
      "/api/agent/connections",
      undefined,
      controller.signal,
    )
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const save = async (section: keyof Connections) => {
    if (!data) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const value = await apiJSON<Connections>("/api/agent/connections", {
        section,
        ...data[section],
        ...(section === "email"
          ? { password: keys.email, clearPassword: clear.email }
          : { apiKey: keys[section], clearApiKey: clear[section] }),
      });
      setData((old) => (old ? { ...old, [section]: value[section] } : value));
      setKeys((old) => ({ ...old, [section]: "" }));
      setClear((old) => ({ ...old, [section]: false }));
      setMessage(
        "Connection saved. Existing active tasks are paused; create a new task to approve changed settings.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <p role="status">{error || "Loading connections…"}</p>;
  const field = (
    section: keyof Connections,
    name: string,
    label: string,
    value: string,
    options: { type?: string; placeholder?: string } = {},
  ) => (
    <label className="field-label">
      {label}
      <input
        disabled={busy}
        type={options.type || "text"}
        value={value}
        placeholder={options.placeholder}
        onChange={(e) => {
          const value = e.target.value;
          if (section === "email" && name === "from") {
            const email = { ...data.email, from: value };
            if (
              email.smtpHost === "smtp.gmail.com" &&
              (!data.email.smtpUser || data.email.smtpUser === data.email.from)
            )
              email.smtpUser = value;
            setData({ ...data, email });
            return;
          }
          setData({
            ...data,
            [section]: { ...data[section], [name]: value },
          });
        }}
      />
    </label>
  );
  const credential = (section: keyof Connections) => (
    <>
      <label className="field-label">
        {section === "whatsapp"
          ? "WhatsApp access token"
          : section === "email"
            ? "SMTP password / app password"
            : "Agent model API key"}
        <input
          disabled={busy}
          type="password"
          autoComplete="new-password"
          value={keys[section]}
          placeholder={
            (
              section === "email"
                ? data.email.hasPassword
                : data[section].hasApiKey
            )
              ? "Saved on this server"
              : section === "model"
                ? "Optional for local models"
                : section === "email"
                  ? "Enter your mailbox app password"
                  : "Paste your Meta access token"
          }
          onChange={(e) => setKeys({ ...keys, [section]: e.target.value })}
        />
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={clear[section]}
          onChange={(e) => setClear({ ...clear, [section]: e.target.checked })}
        />
        Remove saved {section === "email" ? "SMTP password" : section + " key"}
      </label>
    </>
  );
  return (
    <div>
      <h3>Model & delivery connections</h3>
      <p className="agent-intro">
        Choose the model your agent uses and where completed results can go.
        Credentials stay on your local server and are excluded from exports.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      <form
        className="agent-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save("model");
        }}
      >
        <h4>Agent model</h4>
        {data.model.mode === "notebook" && (
          <p className="agent-fine">
            Your agent uses the current NVIDIA model:{" "}
            <strong>{data.model.model}</strong>, through {data.model.baseUrl}.
          </p>
        )}
        <label className="field-label">
          Model connection
          <select
            value={data.model.mode}
            onChange={(e) =>
              setData({
                ...data,
                model: {
                  ...data.model,
                  mode: e.target.value as "custom" | "notebook",
                  tested: false,
                },
              })
            }
          >
            <option value="notebook">Use notebook’s Nemotron connection</option>
            <option value="custom">Use a separate open model</option>
          </select>
        </label>
        {data.model.mode === "custom" && (
          <>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setData({
                  ...data,
                  model: {
                    ...data.model,
                    baseUrl: "http://localhost:11434/v1",
                    model: "gemma4:e4b",
                    tested: false,
                  },
                })
              }
            >
              Use local Gemma 4 / Ollama
            </button>
            {field(
              "model",
              "baseUrl",
              "Agent API base URL",
              data.model.baseUrl,
              { type: "url" },
            )}
            {field("model", "model", "Agent model ID", data.model.model, {
              placeholder: "gemma4:e4b, or another tool-capable model",
            })}
            {credential("model")}
            <p className="agent-fine">
              Start your inference server first. Ollama:{" "}
              <code>ollama pull gemma4:e4b</code>. Hosted models need their
              endpoint, exact model ID and API key.
            </p>
          </>
        )}
        <button className="primary-button" disabled={busy}>
          Save model connection
        </button>{" "}
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setMessage("");
            try {
              await apiJSON("/api/agent/connections/test", {});
              const saved = await apiJSON<Connections>(
                "/api/agent/connections",
              );
              setData((old) => (old ? { ...old, model: saved.model } : saved));
              setMessage(
                "Saved model successfully returned a tool call. Ready for agent tasks.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Test saved model
        </button>
        <p className="agent-fine">
          Save before testing. A separate model must pass the tool-call test
          before creating tasks.
          {data.model.mode === "custom" &&
            data.model.tested &&
            " The saved connection has passed its tool-call test."}
        </p>
      </form>
      <form
        className="agent-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save("email");
        }}
      >
        <h4>Email through SMTP</h4>
        <p className="agent-fine">
          Use your existing mailbox’s SMTP settings. This standard protocol adds
          no email API subscription. Your mailbox’s sending limits apply.
        </p>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() =>
            setData({
              ...data,
              email: {
                ...data.email,
                smtpHost: "smtp.gmail.com",
                smtpPort: 587,
                smtpSecurity: "starttls",
                smtpUser: data.email.smtpUser || data.email.from,
              },
            })
          }
        >
          Use Gmail SMTP settings
        </button>
        {field("email", "smtpHost", "SMTP host", data.email.smtpHost, {
          placeholder: "smtp.gmail.com",
        })}
        <label className="field-label">
          SMTP port
          <input
            type="number"
            min={1}
            max={65535}
            disabled={busy}
            value={data.email.smtpPort}
            onChange={(e) =>
              setData({
                ...data,
                email: { ...data.email, smtpPort: Number(e.target.value) },
              })
            }
          />
        </label>
        <label className="field-label">
          SMTP encryption
          <select
            aria-label="SMTP encryption"
            disabled={busy}
            value={data.email.smtpSecurity}
            onChange={(e) =>
              setData({
                ...data,
                email: {
                  ...data.email,
                  smtpSecurity: e.target.value as "starttls" | "tls",
                },
              })
            }
          >
            <option value="starttls">STARTTLS (usually port 587)</option>
            <option value="tls">TLS (usually port 465)</option>
          </select>
        </label>
        {field("email", "smtpUser", "SMTP username", data.email.smtpUser)}
        {field("email", "from", "Sender email address", data.email.from, {
          type: "email",
        })}
        {field("email", "recipient", "Email recipient", data.email.recipient, {
          type: "email",
        })}
        {credential("email")}
        <p className="agent-fine">
          For Gmail, use an app password with two-step verification enabled. Use
          your provider’s supported mailbox credentials; encryption is required.
        </p>
        <button className="primary-button" disabled={busy}>
          Save email connection
        </button>{" "}
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setMessage("");
            try {
              await apiJSON("/api/agent/connections/email/test", {});
              setMessage(
                "SMTP connection and login verified. No email was sent.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Test saved SMTP connection
        </button>
      </form>
      <form
        className="agent-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save("whatsapp");
        }}
      >
        <h4>WhatsApp Business</h4>
        <p className="agent-fine">
          Use the phone number ID and token from your Meta WhatsApp Business API
          setup. This connects result delivery to your WhatsApp recipient.
        </p>
        {field(
          "whatsapp",
          "phoneNumberId",
          "WhatsApp phone number ID",
          data.whatsapp.phoneNumberId,
        )}
        {field(
          "whatsapp",
          "recipient",
          "WhatsApp recipient",
          data.whatsapp.recipient,
          { placeholder: "+491234567890" },
        )}
        {field(
          "whatsapp",
          "apiVersion",
          "Meta API version",
          data.whatsapp.apiVersion,
        )}
        {credential("whatsapp")}
        {field(
          "whatsapp",
          "templateName",
          "Approved summary template (optional)",
          data.whatsapp.templateName,
        )}
        {field(
          "whatsapp",
          "language",
          "Template language",
          data.whatsapp.language,
        )}
        <p className="agent-fine">
          For scheduled messages outside the 24-hour reply window, use an
          approved template with one body variable for the summary (up to 1000
          characters). Without a template, text delivery requires an open reply
          window. Replies are not imported into NemoDoc.
        </p>
        <button className="primary-button" disabled={busy}>
          Save WhatsApp connection
        </button>
      </form>
    </div>
  );
}
