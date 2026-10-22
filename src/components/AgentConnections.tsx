import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { AgentConnections as Connections } from "../agent-types";
import { apiJSON } from "../lib/api";
import { WebResearchConnection } from "./WebResearchConnection";

export function AgentConnections() {
  const [data, setData] = useState<Connections>();
  const [keys, setKeys] = useState({ model: "", email: "", whatsapp: "" });
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [revealingEmailPassword, setRevealingEmailPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<
    { state: "success" | "error"; message: string } | undefined
  >();
  const [emailTestResult, setEmailTestResult] = useState<
    { state: "checking" | "success" | "error"; message: string } | undefined
  >();
  const [clear, setClear] = useState({
    model: false,
    whatsapp: false,
  });
  const [gmailPresetBackup, setGmailPresetBackup] = useState<Pick<
    Connections["email"],
    "smtpHost" | "smtpPort" | "smtpSecurity" | "smtpUser"
  > | null>(null);
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
          ? { password: keys.email }
          : { apiKey: keys[section], clearApiKey: clear[section] }),
      });
      setData((old) => (old ? { ...old, [section]: value[section] } : value));
      setKeys((old) => ({ ...old, [section]: "" }));
      if (section === "email") {
        setShowEmailPassword(false);
        setPasswordNotice(undefined);
        setEmailTestResult(undefined);
      }
      if (section !== "email")
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
  const toggleEmailPassword = async () => {
    if (showEmailPassword) {
      setShowEmailPassword(false);
      return;
    }
    if (keys.email) {
      setShowEmailPassword(true);
      return;
    }
    setRevealingEmailPassword(true);
    setPasswordNotice(undefined);
    setEmailTestResult(undefined);
    try {
      const { password } = await apiJSON<{ password: string }>(
        "/api/agent/connections/email/password",
        {},
      );
      setKeys((old) => ({ ...old, email: password }));
      setShowEmailPassword(true);
    } catch {
      setPasswordNotice({
        state: "error",
        message: "Could not reveal the saved password.",
      });
    } finally {
      setRevealingEmailPassword(false);
    }
  };
  const clearEmailPassword = async () => {
    if (!data) return;
    setPasswordNotice(undefined);
    setEmailTestResult(undefined);
    if (!data.email.hasPassword) {
      setKeys((old) => ({ ...old, email: "" }));
      setShowEmailPassword(false);
      setPasswordNotice({ state: "success", message: "Password cleared." });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await apiJSON<Connections>("/api/agent/connections", {
        section: "email",
        ...data.email,
        password: "",
        clearPassword: true,
      });
      setData((old) => (old ? { ...old, email: updated.email } : updated));
      setKeys((old) => ({ ...old, email: "" }));
      setShowEmailPassword(false);
      setMessage("");
      setPasswordNotice({
        state: "success",
        message: "Saved SMTP password cleared.",
      });
    } catch (e) {
      setPasswordNotice({
        state: "error",
        message: `Could not clear password: ${(e as Error).message}`,
      });
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
  const credential = (section: keyof Connections) => {
    const label =
      section === "email"
        ? "SMTP password / app password"
        : section === "whatsapp"
          ? "WhatsApp access token"
          : data.model.mode === "openclaw"
            ? "OpenClaw gateway token"
            : "Agent model API key";
    const hasSecret =
      section === "email" ? data.email.hasPassword : data[section].hasApiKey;
    const placeholder = hasSecret
      ? "••••••••••••"
      : section === "model"
        ? data.model.mode === "openclaw"
          ? "Paste the gateway bearer token"
          : "Optional for local models"
        : section === "email"
          ? "Enter your mailbox app password"
          : "Paste your Meta access token";
    if (section === "email")
      return (
        <>
          <label className="field-label">
            {label}
            <span className="agent-password-field">
              <input
                disabled={busy}
                type={showEmailPassword ? "text" : "password"}
                autoComplete="new-password"
                value={keys.email}
                placeholder={placeholder}
                onChange={(e) => {
                  setPasswordNotice(undefined);
                  setKeys({ ...keys, email: e.target.value });
                }}
              />
              <button
                className="agent-password-toggle"
                type="button"
                aria-label={
                  showEmailPassword
                    ? "Hide password"
                    : data.email.hasPassword && !keys.email
                      ? "Reveal saved password"
                      : "Show password"
                }
                aria-pressed={showEmailPassword}
                title={
                  showEmailPassword
                    ? "Hide password"
                    : data.email.hasPassword && !keys.email
                      ? "Reveal saved password"
                      : "Show password"
                }
                disabled={
                  busy ||
                  revealingEmailPassword ||
                  (!keys.email && !data.email.hasPassword)
                }
                onClick={() => void toggleEmailPassword()}
              >
                {showEmailPassword ? (
                  <EyeOff size={16} />
                ) : revealingEmailPassword ? (
                  "…"
                ) : (
                  <Eye size={16} />
                )}
              </button>
            </span>
          </label>
          {(data.email.hasPassword || keys.email) && (
            <div className="agent-password-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={busy || revealingEmailPassword}
                onClick={() => void clearEmailPassword()}
              >
                Clear password
              </button>
            </div>
          )}
          {passwordNotice && (
            <p
              className={
                passwordNotice.state === "error" ? "form-error" : "form-success"
              }
              role={passwordNotice.state === "error" ? "alert" : "status"}
            >
              {passwordNotice.message}
            </p>
          )}
        </>
      );
    return (
      <>
        <label className="field-label">
          {label}
          <input
            disabled={busy}
            type="password"
            autoComplete="new-password"
            value={keys[section]}
            placeholder={placeholder}
            onChange={(e) => setKeys({ ...keys, [section]: e.target.value })}
          />
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={clear[section]}
            onChange={(e) =>
              setClear({ ...clear, [section]: e.target.checked })
            }
          />
          Remove saved {section} key
        </label>
      </>
    );
  };
  const gmailSettingsSelected =
    data.email.smtpHost.trim().toLowerCase() === "smtp.gmail.com";
  const toggleGmailSettings = () => {
    if (gmailPresetBackup) {
      setData({
        ...data,
        email: { ...data.email, ...gmailPresetBackup },
      });
      setGmailPresetBackup(null);
      return;
    }
    if (gmailSettingsSelected) {
      setData({
        ...data,
        email: {
          ...data.email,
          smtpHost: "",
          smtpPort: 587,
          smtpSecurity: "starttls",
          smtpUser: "",
        },
      });
      return;
    }
    setGmailPresetBackup({
      smtpHost: data.email.smtpHost,
      smtpPort: data.email.smtpPort,
      smtpSecurity: data.email.smtpSecurity,
      smtpUser: data.email.smtpUser,
    });
    setData({
      ...data,
      email: {
        ...data.email,
        smtpHost: "smtp.gmail.com",
        smtpPort: 587,
        smtpSecurity: "starttls",
        smtpUser: data.email.smtpUser || data.email.from,
      },
    });
  };
  return (
    <div>
      <h3>Model & delivery connections</h3>
      <WebResearchConnection />
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
            <strong>{data.model.model}</strong>
          </p>
        )}
        <label className="field-label">
          Model connection
          <select
            aria-label="Model connection"
            value={data.model.mode}
            onChange={(e) => {
              const mode = e.target.value as Connections["model"]["mode"];
              setKeys((old) => ({ ...old, model: "" }));
              setClear((old) => ({ ...old, model: false }));
              setData({
                ...data,
                model: {
                  ...data.model,
                  mode,
                  hasApiKey: false,
                  ...(mode === "openclaw"
                    ? {
                        baseUrl: "http://127.0.0.1:18789/v1",
                        model: "openclaw/nemodoc",
                      }
                    : {}),
                  tested: false,
                },
              });
            }}
          >
            <option value="notebook">Use notebook’s Nemotron connection</option>
            <option value="custom">Use a separate open model</option>
            <option value="openclaw">OpenClaw agent through NemoClaw</option>
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
        {data.model.mode === "openclaw" && (
          <>
            <p className="agent-fine">
              Connect a dedicated OpenClaw agent running inside NemoClaw /
              OpenShell. NVIDIA model credentials belong in NemoClaw; this
              connection uses the gateway token.
            </p>
            {field(
              "model",
              "baseUrl",
              "OpenClaw gateway base URL",
              data.model.baseUrl,
              { type: "url", placeholder: "http://127.0.0.1:18789/v1" },
            )}
            {field(
              "model",
              "model",
              "OpenClaw agent target",
              data.model.model,
              { placeholder: "openclaw/nemodoc" },
            )}
            {credential("model")}
            <p className="agent-fine">
              Only approved notebook context and tool results are shared.
              NemoDoc keeps control of evidence, proposals and delivery. Verify
              OpenShell isolation on the runtime host; the gateway test verifies
              tool support, not sandbox enforcement.
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
                saved.model.mode === "openclaw"
                  ? "Gateway tool-call and result round trip passed. Verify the NemoClaw sandbox on its runtime host before using private notes."
                  : "Saved model successfully returned a tool call. Ready for agent tasks.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {data.model.mode === "openclaw"
            ? "Test gateway tool support"
            : "Test saved model"}
        </button>
        <p className="agent-fine">
          Save before testing. A separate model must pass the tool-call test
          before creating tasks.
          {data.model.mode !== "notebook" &&
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
          onClick={toggleGmailSettings}
        >
          {gmailPresetBackup
            ? "Undo Gmail preset"
            : gmailSettingsSelected
              ? "Use custom SMTP settings"
              : "Use Gmail SMTP settings"}
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
            setEmailTestResult({
              state: "checking",
              message: "Checking SMTP connection…",
            });
            try {
              await apiJSON<{ ok: boolean }>(
                "/api/agent/connections/email/test",
                {},
              );
              setEmailTestResult({
                state: "success",
                message: "SMTP connection verified.",
              });
            } catch (e) {
              setEmailTestResult({
                state: "error",
                message: `Connection failed: ${(e as Error).message}`,
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          Test saved SMTP connection
        </button>
        {emailTestResult && (
          <p
            className={
              emailTestResult.state === "error"
                ? "form-error"
                : emailTestResult.state === "success"
                  ? "form-success"
                  : "agent-fine"
            }
            role={emailTestResult.state === "error" ? "alert" : "status"}
          >
            {emailTestResult.message}
          </p>
        )}
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
