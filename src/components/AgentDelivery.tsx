import { useState } from "react";
import { apiJSON } from "../lib/api";
import type {
  AgentRun,
  AgentChannel,
  AgentDelivery as Delivery,
  DeliveryTarget,
} from "../agent-types";

type Preview = DeliveryTarget & {
  from?: string;
  runId: string;
  title: string;
  text: string;
  templateName: string;
};
export function AgentDelivery({ run }: { run: AgentRun }) {
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState<Delivery>();
  const load = async (channel: AgentChannel) => {
    setBusy(true);
    setError("");
    setPreview(undefined);
    setReceipt(undefined);
    try {
      setPreview(
        await apiJSON<Preview>("/api/agent/delivery/preview", {
          runId: run.id,
          channel,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="agent-delivery">
      <h4>Deliver this result</h4>
      {(["email", "whatsapp"] as const).map((channel) => (
        <button
          className="secondary-button"
          key={channel}
          disabled={
            busy ||
            run.deliveries?.some(
              (d) => d.channel === channel && d.status !== "failed",
            )
          }
          onClick={() => void load(channel)}
        >
          Preview {channel === "email" ? "email" : "WhatsApp"}
        </button>
      ))}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {preview && (
        <div className="agent-form">
          <h4>{preview.title}</h4>
          <p className="agent-fine">
            {preview.channel} → {preview.recipient}
            {preview.templateName && ` · Template: ${preview.templateName}`}
          </p>
          {preview.from && <p className="agent-fine">From: {preview.from}</p>}
          <pre>{preview.text}</pre>
          <button
            className="primary-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setReceipt(
                  await apiJSON<Delivery>("/api/agent/delivery/send", {
                    ...preview,
                    confirm: true,
                  }),
                );
                setPreview(undefined);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Send to {preview.recipient}
          </button>{" "}
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => setPreview(undefined)}
          >
            Cancel
          </button>
        </div>
      )}
      {receipt && (
        <p role="status" className="agent-fine">
          {receipt.status === "accepted"
            ? "Provider accepted the message. Delivery to the recipient is not yet confirmed."
            : receipt.error}
        </p>
      )}
      {!!run.deliveries?.length && (
        <ul className="agent-fine">
          {run.deliveries.map((d, i) => (
            <li key={i}>
              {d.channel} → {d.recipient}: {d.status}
              {d.messageId && ` · ${d.messageId}`}
              {d.error && ` · ${d.error}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
