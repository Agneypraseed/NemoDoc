import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { endpoint, isLocal, type SettingsStore } from "./settings.ts";
import type {
  AgentConnections,
  AgentChannel,
  DeliveryTarget,
} from "../src/agent-types.ts";
import {
  createSmtpTransport,
  smtpOptions,
  smtpError,
  smtpDefinitelyRejected,
  type SmtpTransportFactory,
  type SmtpConnection,
} from "./smtp.ts";
import type { ModelRequestObserver } from "./model-observer.ts";
import { notifyModelObserver } from "./model-observer.ts";

const secret = z.string().trim().max(2048).optional();
export const connectionInput = z.discriminatedUnion("section", [
  z.object({
    section: z.literal("model"),
    mode: z.enum(["notebook", "custom"]),
    baseUrl: endpoint,
    model: z.string().trim().min(1).max(200),
    apiKey: secret,
    clearApiKey: z.boolean().optional(),
  }),
  z.object({
    section: z.literal("email"),
    smtpHost: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._:\[\]-]{1,253}$|^$/),
    smtpPort: z.number().int().min(1).max(65535),
    smtpSecurity: z.enum(["tls", "starttls"]),
    smtpUser: z.string().trim().max(254),
    from: z.union([z.literal(""), z.email()]),
    recipient: z.union([z.literal(""), z.email()]),
    password: secret,
    clearPassword: z.boolean().optional(),
  }),
  z.object({
    section: z.literal("whatsapp"),
    phoneNumberId: z.string().regex(/^\d{1,30}$|^$/),
    recipient: z.string().regex(/^\+?[1-9]\d{6,14}$|^$/),
    apiVersion: z.string().regex(/^v\d{1,3}\.0$/),
    templateName: z.string().regex(/^[a-z0-9_]{1,100}$|^$/),
    language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
    apiKey: secret,
    clearApiKey: z.boolean().optional(),
  }),
]);
type Stored = {
  model: {
    mode: "notebook" | "custom";
    baseUrl: string;
    model: string;
    apiKey: string;
    tested: boolean;
  };
  email: SmtpConnection & {
    revision: string;
  };
  whatsapp: {
    phoneNumberId: string;
    recipient: string;
    apiVersion: string;
    templateName: string;
    language: string;
    apiKey: string;
    revision: string;
  };
};
export class AgentConnectionStore {
  value: Stored = {
    model: {
      mode: "notebook",
      baseUrl: "http://localhost:11434/v1",
      model: "gemma4:e4b",
      apiKey: "",
      tested: false,
    },
    email: {
      smtpHost: "",
      smtpPort: 587,
      smtpSecurity: "starttls",
      smtpUser: "",
      password: "",
      from: "",
      recipient: "",
      revision: randomUUID(),
    },
    whatsapp: {
      phoneNumberId: "",
      recipient: "",
      apiVersion: "v26.0",
      templateName: "",
      language: "en_US",
      apiKey: "",
      revision: randomUUID(),
    },
  };
  constructor(
    private settings: SettingsStore,
    private filename?: string,
    private smtpFactory: SmtpTransportFactory = createSmtpTransport,
  ) {
    if (filename && existsSync(filename)) {
      const saved = JSON.parse(readFileSync(filename, "utf8"));
      let retiredEmail = false;
      let retiredRuntime = false;
      for (const section of ["model", "email", "whatsapp"] as const) {
        if (section === "email" && typeof saved.email?.smtpHost !== "string") {
          // Retire the previous API integration without carrying its credential
          // into a mailbox login. Existing delivery approvals become invalid.
          this.value.email.recipient = z
            .union([z.literal(""), z.email()])
            .parse(saved.email?.recipient || "");
          retiredEmail = true;
          continue;
        }
        // Retired runtime connections cannot be used for new SDK runs.
        if (section === "model" && saved.model?.mode === "openclaw") {
          retiredRuntime = true;
          continue;
        }
        const parsed = connectionInput.parse({ ...saved[section], section });
        const { section: _section, ...fields } = parsed;
        Object.assign(
          this.value[section],
          fields,
          section === "model"
            ? { tested: saved.model.tested === true }
            : { revision: z.uuid().parse(saved[section].revision) },
        );
      }
      if (retiredEmail || retiredRuntime) this.flush();
    }
  }
  public(): AgentConnections {
    const redact = <T extends { apiKey: string }>(value: T) => {
      const { apiKey, ...rest } = value;
      return { ...rest, hasApiKey: !!apiKey };
    };
    return {
      model: redact({
        ...this.value.model,
        ...(this.value.model.mode === "notebook"
          ? {
              baseUrl: this.settings.value.baseUrl,
              model: this.settings.value.model,
              apiKey: this.settings.value.apiKey,
            }
          : {}),
      }),
      email: (({ password, ...rest }) => ({
        ...rest,
        hasPassword: !!password,
      }))(this.value.email),
      whatsapp: redact(this.value.whatsapp),
    };
  }
  emailPassword() {
    return this.value.email.password;
  }
  save(input: z.infer<typeof connectionInput>) {
    if (input.section === "email") {
      const { section: _section, password, clearPassword, ...fields } = input;
      const previous = this.value.email;
      const retain =
        fields.smtpHost === previous.smtpHost &&
        fields.smtpUser === previous.smtpUser;
      this.value.email = {
        ...fields,
        password: clearPassword
          ? ""
          : password || (retain ? previous.password : ""),
        revision: randomUUID(),
      };
      this.flush();
      return;
    }
    const { section, apiKey, clearApiKey, ...fields } = input;
    const previous = this.value[section];
    const retain =
      section !== "model" ||
      (this.value.model.mode === input.mode &&
        new URL(this.value.model.baseUrl).origin ===
          new URL((fields as Stored["model"]).baseUrl).origin);
    const next = {
      ...previous,
      ...fields,
      apiKey: clearApiKey ? "" : apiKey || (retain ? previous.apiKey : ""),
      ...(section === "model"
        ? { tested: false }
        : { revision: randomUUID() }),
    };
    Object.assign(previous, next);
    this.flush();
  }
  flush() {
    if (!this.filename) return;
    mkdirSync(path.dirname(this.filename), { recursive: true });
    writeFileSync(this.filename + ".tmp", JSON.stringify(this.value), {
      mode: 0o600,
    });
    renameSync(this.filename + ".tmp", this.filename);
  }
  runtime() {
    return this.value.model.mode !== "notebook"
      ? { ...this.value.model }
      : this.settings.value;
  }
  target(channel: AgentChannel): DeliveryTarget {
    const c = this.value[channel];
    if (
      !c.recipient ||
      (channel === "email"
        ? !this.value.email.password ||
          !this.value.email.smtpHost ||
          !this.value.email.smtpUser ||
          !this.value.email.from
        : !this.value.whatsapp.apiKey || !this.value.whatsapp.phoneNumberId)
    )
      throw new Error(
        `Configure ${channel} credentials and recipient in Connections first.`,
      );
    return { channel, recipient: c.recipient, revision: c.revision };
  }
  async testEmail(signal = AbortSignal.timeout(30000)) {
    if (
      !this.value.email.smtpHost ||
      !this.value.email.smtpUser ||
      !this.value.email.password
    )
      throw new Error(
        "Save the SMTP host, username and password before testing.",
      );
    signal.throwIfAborted();
    const transport = this.smtpFactory(smtpOptions(this.value.email));
    const close = () => transport.close();
    signal.addEventListener("abort", close, { once: true });
    try {
      await transport.verify();
      signal.throwIfAborted();
    } catch (error) {
      throw new Error(smtpError(error, "verify"));
    } finally {
      signal.removeEventListener("abort", close);
      transport.close();
    }
  }
  async modelJSON(
    fetcher: typeof fetch,
    body: unknown,
    signal = AbortSignal.timeout(120000),
    observer?: ModelRequestObserver,
    connectionOverride?: { baseUrl: string; model: string; apiKey: string },
  ) {
    if (connectionOverride) {
      endpoint.parse(connectionOverride.baseUrl);
      if ((body as { model?: unknown })?.model !== connectionOverride.model)
        throw new Error(
          "Research requests must use the approved profile model.",
        );
    }
    const c = connectionOverride ?? this.runtime();
    if (!c.apiKey && !isLocal(c.baseUrl))
      throw new Error("Save an API key for the agent model.");
    const url = c.baseUrl.replace(/\/$/, "") + "/chat/completions";
    const model = String((body as { model?: unknown })?.model ?? "");
    if (
      new URL(c.baseUrl).hostname === "api.openai.com" &&
      body &&
      typeof body === "object"
    ) {
      const request = { ...body } as Record<string, unknown>;
      if (!Array.isArray(request.tools) || !request.tools.length)
        delete request.tool_choice;
      body = request;
    }
    if (
      new URL(c.baseUrl).hostname === "api.openai.com" &&
      /^gpt-5(?:[.-]|$)/.test(model) &&
      body &&
      typeof body === "object" &&
      "max_tokens" in body
    ) {
      const { max_tokens, ...rest } = body as Record<string, unknown>;
      body = {
        ...rest,
        max_completion_tokens: rest.max_completion_tokens ?? max_tokens,
      };
    }
    await notifyModelObserver(() =>
      observer?.onRequest?.({
        url,
        model,
        body,
        at: Date.now(),
      }),
    );
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
        redirect: "error",
      });
    } catch (error) {
      await notifyModelObserver(() =>
        observer?.onError?.((error as Error).message, Date.now()),
      );
      throw error;
    }
    const requestId =
      response.headers.get("x-request-id") ||
      response.headers.get("request-id") ||
      response.headers.get("x-nvidia-request-id") ||
      response.headers.get("x-openai-request-id") ||
      undefined;
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      await notifyModelObserver(() =>
        observer?.onResponse?.({
          status: response.status,
          requestId,
          errorBody,
          at: Date.now(),
        }),
      );
      throw new Error(
        response.status >= 500
          ? `Agent model returned HTTP ${response.status}. The provider could not complete the request. Test this model again or choose another tested model in a new reviewed plan.`
          : `Agent model returned HTTP ${response.status}. Check its connection and tool support.`,
      );
    }
    try {
      const result: any = await response.json();
      const usage = result?.usage;
      await notifyModelObserver(() =>
        observer?.onResponse?.({
          status: response.status,
          requestId,
          returnedModel:
            typeof result?.model === "string" ? result.model : undefined,
          responseId: typeof result?.id === "string" ? result.id : undefined,
          finishReason:
            typeof result?.choices?.[0]?.finish_reason === "string"
              ? result.choices[0].finish_reason
              : undefined,
          usage,
          promptTokens:
            typeof usage?.prompt_tokens === "number"
              ? usage.prompt_tokens
              : undefined,
          completionTokens:
            typeof usage?.completion_tokens === "number"
              ? usage.completion_tokens
              : undefined,
          body: result,
          at: Date.now(),
        }),
      );
      return result;
    } catch (error) {
      await notifyModelObserver(() =>
        observer?.onError?.((error as Error).message, Date.now()),
      );
      throw error;
    }
  }
  async send(
    fetcher: typeof fetch,
    target: DeliveryTarget,
    title: string,
    text: string,
    signal: AbortSignal,
  ) {
    const current = this.target(target.channel);
    if (
      current.revision !== target.revision ||
      current.recipient !== target.recipient
    )
      throw new Error(
        "Delivery connection changed. Preview again or create a new task.",
      );
    let url: string, body: unknown;
    if (target.channel === "email") {
      const connection = { ...this.value.email };
      signal.throwIfAborted();
      const transport = this.smtpFactory(smtpOptions(connection));
      const close = () => transport.close();
      signal.addEventListener("abort", close, { once: true });
      try {
        const result = await transport.sendMail({
          from: connection.from,
          to: target.recipient,
          subject: title,
          text,
        });
        if (!result.accepted.length || result.rejected.length)
          throw new DeliveryRejected(
            "SMTP rejected the recipient. Check the email address.",
          );
        if (!result.messageId) throw new Error("SMTP returned no message ID.");
        return result.messageId;
      } catch (error) {
        if (error instanceof DeliveryRejected) throw error;
        if (smtpDefinitelyRejected(error))
          throw new DeliveryRejected(smtpError(error));
        throw new Error(smtpError(error));
      } finally {
        signal.removeEventListener("abort", close);
        transport.close();
      }
    } else {
      const c = this.value.whatsapp;
      url = `https://graph.facebook.com/${c.apiVersion}/${c.phoneNumberId}/messages`;
      if (!c.templateName && text.length > 4096)
        throw new DeliveryRejected(
          "WhatsApp messages are limited to 4096 characters. Use email for this result.",
        );
      if (c.templateName && text.length > 1000)
        throw new DeliveryRejected(
          "This result exceeds the template summary limit. Use email or a shorter task.",
        );
      body = {
        messaging_product: "whatsapp",
        to: target.recipient.replace(/^\+/, ""),
        ...(c.templateName
          ? {
              type: "template",
              template: {
                name: c.templateName,
                language: { code: c.language },
                components: [
                  { type: "body", parameters: [{ type: "text", text }] },
                ],
              },
            }
          : { type: "text", text: { body: text } }),
      };
    }
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.value.whatsapp.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
      redirect: "error",
    });
    if (!response.ok) {
      const message = `Delivery provider returned HTTP ${response.status}. Check credentials, recipient and WhatsApp template/window settings.`;
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408
      )
        throw new DeliveryRejected(message);
      throw new Error(message);
    }
    const value = await response.json();
    const messageId = value.messages?.[0]?.id;
    if (typeof messageId !== "string" || !messageId)
      throw new Error(
        "Provider response did not include a message ID. Check delivery before sending again.",
      );
    return messageId;
  }
}
export class DeliveryRejected extends Error {}
