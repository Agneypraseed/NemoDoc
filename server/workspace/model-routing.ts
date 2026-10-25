import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  researchProfileSchema,
  researchCapabilities,
  routingPriorities,
  type ResearchModelCatalog,
  type ResearchModelRoute,
} from "../../src/research-model-types.ts";
import type { AgentConnectionStore } from "../agent-connections.ts";
import { endpoint, isLocal } from "../settings.ts";
import { agentResponseSchema } from "../agent-response.ts";
import { chatOptions } from "../providers.ts";
import type { ModelRequestObserver } from "../model-observer.ts";

const profileSave = researchProfileSchema
  .extend({
    apiKey: z.string().trim().max(2048).optional(),
    clearApiKey: z.boolean().optional(),
  })
  .strict();
const storedProfile = researchProfileSchema.extend({
  apiKey: z.string(),
  tested: z.boolean(),
  revision: z.string(),
});
const storedSchema = z.object({
  profiles: z.array(storedProfile).max(12),
  plannerProfileId: z.string(),
  priority: z.enum(routingPriorities),
});
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class ResearchModels {
  // Keep prior credentials redacted while an in-flight request finishes after edits.
  private retiredSecrets = new Set<string>();
  private value: z.infer<typeof storedSchema> = {
    profiles: [],
    plannerProfileId: "default",
    priority: "balanced",
  };
  constructor(
    private connections: AgentConnectionStore,
    private filename?: string,
  ) {
    if (filename && existsSync(filename)) {
      this.value = storedSchema.parse(
        JSON.parse(readFileSync(filename, "utf8")),
      );
      if (
        new Set(this.value.profiles.map((p) => p.id)).size !==
        this.value.profiles.length
      )
        throw new Error("Duplicate saved research model profiles.");
      for (const profile of this.value.profiles)
        endpoint.parse(profile.baseUrl);
    }
  }
  private flush() {
    if (!this.filename) return;
    mkdirSync(path.dirname(this.filename), { recursive: true });
    writeFileSync(this.filename + ".tmp", JSON.stringify(this.value), {
      mode: 0o600,
    });
    renameSync(this.filename + ".tmp", this.filename);
  }
  secrets() {
    return [
      ...this.retiredSecrets,
      ...this.value.profiles.map((p) => p.apiKey),
    ].filter(Boolean);
  }
  private defaultProfile() {
    const c = this.connections.runtime();
    return {
      id: "default",
      name: "Current agent connection",
      baseUrl: c.baseUrl,
      model: c.model,
      apiKey: c.apiKey,
      capabilities: [...researchCapabilities],
      costTier: "unspecified" as const,
      strengths: "The existing notebook or custom agent model.",
      tested:
        (this.connections.value.model.mode === "notebook" ||
          this.connections.value.model.tested) &&
        (!!c.apiKey || isLocal(c.baseUrl)),
      revision: fingerprint({
        ...c,
        mode: this.connections.value.model.mode,
        tested: this.connections.value.model.tested,
      }),
    };
  }
  revision() {
    return fingerprint({ ...this.value, default: this.defaultProfile() });
  }
  catalog(): ResearchModelCatalog {
    return {
      profiles: [this.defaultProfile(), ...this.value.profiles].map(
        ({ apiKey, revision: _revision, ...p }) => ({
          ...p,
          hasApiKey: !!apiKey,
        }),
      ),
      plannerProfileId: this.value.plannerProfileId,
      priority: this.value.priority,
      revision: this.revision(),
    };
  }
  save(body: unknown) {
    const { apiKey, clearApiKey, ...profile } = profileSave.parse(body);
    const baseUrl = endpoint.parse(profile.baseUrl);
    const previous = this.value.profiles.find((p) => p.id === profile.id);
    if (previous?.apiKey) this.retiredSecrets.add(previous.apiKey);
    if (!previous && this.value.profiles.length >= 12)
      throw new Error("Research supports up to twelve saved model profiles.");
    const retain =
      previous && new URL(previous.baseUrl).origin === new URL(baseUrl).origin;
    const next = {
      ...profile,
      baseUrl,
      apiKey: clearApiKey ? "" : apiKey || (retain ? previous.apiKey : ""),
      tested: false,
      revision: randomUUID(),
    };
    if (previous)
      this.value.profiles[this.value.profiles.indexOf(previous)] = next;
    else this.value.profiles.push(next);
    this.flush();
    return this.catalog();
  }
  remove(id: string) {
    if (id === "default")
      throw new Error("The current connection cannot be removed here.");
    if (!this.value.profiles.some((p) => p.id === id))
      throw new Error("Research model profile not found.");
    const removed = this.value.profiles.find((p) => p.id === id)!;
    if (removed.apiKey) this.retiredSecrets.add(removed.apiKey);
    this.value.profiles = this.value.profiles.filter((p) => p.id !== id);
    if (this.value.plannerProfileId === id)
      this.value.plannerProfileId = "default";
    this.flush();
    return this.catalog();
  }
  preferences(body: unknown) {
    const input = z
      .object({
        plannerProfileId: z.string().min(1).max(64),
        priority: z.enum(routingPriorities),
      })
      .strict()
      .parse(body);
    this.resolve(input.plannerProfileId);
    Object.assign(this.value, input);
    this.flush();
    return this.catalog();
  }
  resolve(id: string) {
    const profile =
      id === "default"
        ? this.defaultProfile()
        : this.value.profiles.find((p) => p.id === id);
    if (!profile)
      throw new Error(
        "The assigned research model was removed. Review a new plan.",
      );
    if (!profile.tested || (!profile.apiKey && !isLocal(profile.baseUrl)))
      throw new Error(
        `Save and test ${profile.name} before assigning it to research.`,
      );
    return { ...profile };
  }
  snapshot(
    id: string,
    selection: ResearchModelRoute["selection"] = "default",
    reason = "Uses the current agent connection.",
  ): ResearchModelRoute {
    const p = this.resolve(id);
    return {
      profileId: id,
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
      configurationRevision: fingerprint(p),
      selection,
      reason,
    };
  }
  verify(route: ResearchModelRoute) {
    if (
      fingerprint(this.resolve(route.profileId)) !== route.configurationRevision
    )
      throw new Error(
        `The assigned model connection ${route.name} changed. Start a new run with a reviewed plan.`,
      );
  }
  request(
    fetcher: typeof fetch,
    route: ResearchModelRoute,
    body: Record<string, unknown>,
    signal: AbortSignal,
    observer?: ModelRequestObserver,
  ) {
    this.verify(route);
    const p = this.resolve(route.profileId);
    return this.connections.modelJSON(
      fetcher,
      { ...body, ...chatOptions(p), model: p.model },
      signal,
      observer,
      p,
    );
  }
  async test(id: string, fetcher: typeof fetch) {
    const profile = this.value.profiles.find((p) => p.id === id);
    if (!profile) throw new Error("Choose a saved research profile to test.");
    profile.tested = false;
    this.flush();
    const saved = { ...profile },
      revision = profile.revision;
    const signal = AbortSignal.timeout(60000),
      receipt = randomUUID();
    const tools = [
      {
        type: "function",
        function: {
          name: "connection_probe",
          description: "Confirm tool support. Call with ok=true.",
          parameters: {
            type: "object",
            properties: { ok: { type: "boolean", const: true } },
            required: ["ok"],
            additionalProperties: false,
          },
        },
      },
    ];
    const messages: any[] = [
      {
        role: "user",
        content:
          "Call connection_probe with ok=true. After its tool result arrives, reply with only its receipt value.",
      },
    ];
    const call = async (body: Record<string, unknown>) =>
      agentResponseSchema.parse(
        await this.connections.modelJSON(
          fetcher,
          {
            model: saved.model,
            ...chatOptions(saved),
            stream: false,
            temperature: 0,
            max_tokens: 300,
            ...body,
          },
          signal,
          undefined,
          saved,
        ),
      );
    const first = await call({ messages, tools, tool_choice: "auto" });
    const message = first.choices[0].message,
      tool = message.tool_calls?.[0];
    if (
      message.tool_calls?.length !== 1 ||
      tool?.function.name !== "connection_probe" ||
      !z
        .object({ ok: z.literal(true) })
        .strict()
        .safeParse(JSON.parse(tool.function.arguments)).success
    )
      throw new Error(
        "This model did not return the required tool call. Check its function-calling support.",
      );
    messages.push(
      {
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      },
      {
        role: "tool",
        tool_call_id: tool.id,
        content: JSON.stringify({ receipt }),
      },
    );
    const second = await call({ messages, tool_choice: "none" });
    if (
      second.choices[0].message.tool_calls?.length ||
      second.choices[0].message.content?.trim() !== receipt
    )
      throw new Error(
        "The model did not consume the tool result correctly. Choose a model with tool round-trip support.",
      );
    const current = this.value.profiles.find((p) => p.id === id);
    if (!current || current.revision !== revision)
      throw new Error(
        "Research model changed during testing. Test the saved profile again.",
      );
    current.tested = true;
    this.flush();
    return this.catalog();
  }
}
