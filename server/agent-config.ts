import type express from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AgentWorker } from "./agent.ts";
import { connectionInput } from "./agent-connections.ts";
import { nativeNemoClawRead, type NemoClawReader } from "./agent-monitor.ts";
import {
  configuredAgentId,
  agentName,
  modelRoutingInput,
  newAgentInput,
  roleFileInput,
  roleFileName,
  roleContent,
  type AgentConfiguration,
  type AgentRoleFile,
  type ManagedAgent,
} from "../src/agent-config-types.ts";

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function nativeResult<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      "The runtime returned an invalid acknowledgement or configuration. Reload before retrying a write.",
    );
  return parsed.data;
}
const nativeModel = z.union([
  z.string().max(200),
  z.object({
    primary: z.string().max(200).optional(),
    fallbacks: z.array(z.string().max(200)).max(100).optional(),
  }),
]);
const nativeAgent = z.object({
  id: configuredAgentId,
  name: z.string().max(200).optional(),
  identity: z.object({ name: z.string().max(200).optional() }).optional(),
  model: nativeModel.optional(),
});
const nativeRoster = z.object({ agents: z.array(nativeAgent).max(500) });
const nativeCatalog = z.object({
  models: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        name: z.string().max(200),
        provider: z.string().min(1).max(100),
        available: z.boolean().optional(),
        supportsTools: z.boolean().optional(),
      }),
    )
    .max(3000),
});
const nativeFile = z.object({
  agentId: configuredAgentId,
  file: z.object({
    name: roleFileName,
    content: roleContent.optional(),
    missing: z.boolean(),
  }),
});
const mutationAck = z.object({ ok: z.literal(true) });
const configuredTools = z.object({
  tools: z
    .object({ deny: z.array(z.string().max(200)).max(500).optional() })
    .optional(),
});
const configSnapshot = z.object({
  hash: z.string().min(1).max(100),
  config: z
    .object({
      agents: z
        .object({
          entries: z.record(z.string(), configuredTools).optional(),
          list: z.array(configuredTools.extend({ id: z.string() })).optional(),
        })
        .optional(),
    })
    .optional(),
});
const restrictedTools = (
  config: z.infer<typeof configSnapshot>,
  id: string,
) => ({
  ...toolPolicy,
  deny: [
    ...new Set([
      ...(config.config?.agents?.entries?.[id]?.tools?.deny ||
        config.config?.agents?.list?.find((a) => a.id === id)?.tools?.deny ||
        []),
      ...toolPolicy.deny,
    ]),
  ],
});
const toolPolicy = {
  profile: "minimal",
  deny: [
    "gateway",
    "group:runtime",
    "group:fs",
    "group:messaging",
    "group:sessions",
    "group:memory",
    "group:web",
    "group:ui",
    "group:automation",
    "group:nodes",
    "group:agents",
    "group:media",
    "group:plugins",
  ],
};

export class AgentConfigurationManager {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private worker: AgentWorker,
    private sandbox?: string,
    private run: NemoClawReader = nativeNemoClawRead,
  ) {}
  private async rpc(method: string, params: unknown) {
    if (!this.sandbox || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(this.sandbox))
      throw new Error(
        "Agent configuration needs the NemoClaw CLI on this server and a valid NEMODOC_NEMOCLAW_SANDBOX.",
      );
    try {
      return JSON.parse(
        await this.run([
          this.sandbox,
          "exec",
          "--",
          "openclaw",
          "gateway",
          "call",
          method,
          "--params",
          JSON.stringify(params),
          "--json",
        ]),
      );
    } catch {
      throw new Error(
        `Could not confirm ${method} on the NemoClaw runtime. Reload before retrying a write; check the runtime host if the problem persists.`,
      );
    }
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const work = this.queue.then(action);
    this.queue = work.catch(() => {});
    return work;
  }
  private async patch(params: unknown) {
    nativeResult(mutationAck, await this.rpc("config.patch", params));
  }
  private invalidate(id: string) {
    if (this.worker.connections.invalidateAgentRuntime(id)) {
      this.worker.abort();
      for (const task of this.worker.data.state.tasks)
        if (task.status === "active") task.status = "paused";
      this.worker.data.flush();
    }
  }
  private async agents(): Promise<ManagedAgent[]> {
    const result = nativeResult(
      nativeRoster,
      await this.rpc("agents.list", {}),
    );
    return result.agents.map((row) => {
      const model =
        typeof row.model === "string"
          ? { primary: row.model, fallbacks: [] }
          : {
              primary: row.model?.primary || "",
              fallbacks: row.model?.fallbacks || [],
            };
      return {
        id: row.id,
        name: row.identity?.name || row.name || row.id,
        ...model,
        revision: fingerprint({ id: row.id, model }),
      };
    });
  }
  async configuration(): Promise<AgentConfiguration> {
    try {
      const agents = await this.agents();
      try {
        const catalog = nativeResult(
          nativeCatalog,
          await this.rpc("models.list", {
            view: "configured",
            preparedOnly: true,
          }),
        );
        const models = [
          ...new Map(
            catalog.models.map((model) => {
              const id = model.id.startsWith(model.provider + "/")
                ? model.id
                : `${model.provider}/${model.id}`;
              return [id, { ...model, id }];
            }),
          ).values(),
        ];
        return {
          sandbox: this.sandbox,
          available: true,
          message: "Configuration is saved in your OpenClaw runtime.",
          agents,
          models,
        };
      } catch {
        return {
          sandbox: this.sandbox,
          available: true,
          message: "Agent configuration connected.",
          agents,
          models: [],
          catalogError:
            "The runtime model catalog is unavailable. You can enter an exact configured provider/model ID.",
        };
      }
    } catch {
      return {
        available: false,
        message:
          "Connect NemoDoc to the NemoClaw host to configure agents, models and Markdown role files. The runtime CLI must be available on this server.",
        agents: [],
        models: [],
      };
    }
  }
  async file(agentId: string, name: string): Promise<AgentRoleFile> {
    const id = configuredAgentId.parse(agentId),
      filename = roleFileName.parse(name);
    const file = nativeResult(
      nativeFile,
      await this.rpc("agents.files.get", { agentId: id, name: filename }),
    );
    if (file.agentId !== id || file.file.name !== filename)
      throw new Error(
        "The runtime returned a different agent file. Nothing was saved.",
      );
    if (!file.file.missing && file.file.content === undefined)
      throw new Error(
        "The runtime did not return the existing file content. Reload before editing.",
      );
    const content = file.file.content || "";
    return {
      agentId: id,
      name: filename,
      content,
      missing: file.file.missing,
      revision: fingerprint({
        id,
        name: filename,
        missing: file.file.missing,
        content,
      }),
    };
  }
  saveFile(body: unknown) {
    const input = roleFileInput.parse(body);
    return this.serial(async () => {
      const current = await this.file(input.agentId, input.name);
      if (current.revision !== input.revision)
        throw new Error(
          "This role file changed since you opened it. Reload the file before saving.",
        );
      this.invalidate(input.agentId);
      nativeResult(
        mutationAck,
        await this.rpc("agents.files.set", {
          agentId: input.agentId,
          name: input.name,
          content: input.content,
        }),
      );
      // Do not silently treat a lost or mismatched acknowledgement as a save.
      const result = await this.file(input.agentId, input.name);
      if (result.content !== input.content)
        throw new Error(
          "The saved file differs from this edit. Reload it before making another change.",
        );
      return result;
    });
  }
  saveModels(body: unknown) {
    const input = modelRoutingInput.parse(body);
    return this.serial(async () => {
      const config = nativeResult(
        configSnapshot,
        await this.rpc("config.get", {}),
      );
      const current = (await this.agents()).find((a) => a.id === input.agentId);
      if (!current || current.revision !== input.revision)
        throw new Error(
          "This agent's models changed. Reload its settings before saving.",
        );
      this.invalidate(input.agentId);
      // Keyed roster patch + native baseHash prevents replacing other agents or
      // replaying stale whole-config data. No provider secrets cross the API.
      await this.patch({
        baseHash: config.hash,
        raw: JSON.stringify({
          agents: {
            entries: {
              [input.agentId]: {
                model: input.primary
                  ? { primary: input.primary, fallbacks: input.fallbacks }
                  : null,
              },
            },
          },
        }),
        note: "NemoDoc agent model routing",
        replacePaths: [`agents.entries.${input.agentId}.model.fallbacks`],
      });
      return {
        ok: true,
        message:
          "Model routing saved. The gateway may reload. Reopen settings to read back the applied configuration.",
      };
    });
  }
  rename(body: unknown) {
    const input = z
      .object({ agentId: configuredAgentId, name: agentName })
      .strict()
      .parse(body);
    return this.serial(async () => {
      this.invalidate(input.agentId);
      nativeResult(mutationAck, await this.rpc("agents.update", input));
      return { ok: true };
    });
  }
  select(body: unknown) {
    const { agentId } = z
      .object({ agentId: configuredAgentId })
      .strict()
      .parse(body);
    return this.serial(async () => {
      if (!(await this.agents()).some((a) => a.id === agentId))
        throw new Error("Choose a configured agent.");
      const model = this.worker.connections.value.model;
      if (model.mode !== "openclaw" || !model.apiKey)
        throw new Error(
          "Save an OpenClaw gateway connection and token in Connections first.",
        );
      this.worker.connections.save(
        connectionInput.parse({
          section: "model",
          ...model,
          model: `openclaw/${agentId}`,
        }),
      );
      this.worker.abort();
      for (const task of this.worker.data.state.tasks)
        if (task.status === "active") task.status = "paused";
      this.worker.data.flush();
      return {
        ok: true,
        message:
          "Agent selected. Test the gateway connection before running tasks.",
      };
    });
  }
  create(body: unknown) {
    const input = newAgentInput.parse(body);
    return this.serial(async () => {
      const created = nativeResult(
        z.object({ ok: z.literal(true), agentId: configuredAgentId }),
        await this.rpc("agents.create", input),
      );
      try {
        const config = nativeResult(
          configSnapshot,
          await this.rpc("config.get", {}),
        );
        await this.patch({
          baseHash: config.hash,
          raw: JSON.stringify({
            agents: {
              entries: {
                [created.agentId]: {
                  tools: restrictedTools(config, created.agentId),
                },
              },
            },
          }),
          note: "NemoDoc restricted agent tools",
        });
        return {
          ok: true,
          agentId: created.agentId,
          message:
            "Agent created with restricted built-in tools. Configure its model and role files next.",
        };
      } catch {
        return {
          ok: false,
          agentId: created.agentId,
          message:
            "Agent created, but its tool restrictions could not be confirmed. Do not run it yet. Apply restrictions from its settings before use.",
        };
      }
    });
  }
  restrict(body: unknown) {
    const { agentId } = z
      .object({ agentId: configuredAgentId })
      .strict()
      .parse(body);
    return this.serial(async () => {
      const config = nativeResult(
        configSnapshot,
        await this.rpc("config.get", {}),
      );
      if (!(await this.agents()).some((a) => a.id === agentId))
        throw new Error("Choose a configured agent.");
      this.invalidate(agentId);
      await this.patch({
        baseHash: config.hash,
        raw: JSON.stringify({
          agents: {
            entries: { [agentId]: { tools: restrictedTools(config, agentId) } },
          },
        }),
        note: "NemoDoc restricted agent tools",
      });
      return { ok: true };
    });
  }
}

export function registerAgentConfiguration(
  app: express.Express,
  worker: AgentWorker,
  sandbox?: string,
  run?: NemoClawReader,
) {
  const manager = new AgentConfigurationManager(worker, sandbox, run);
  app.get("/api/agent/manage", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await manager.configuration());
  });
  app.get("/api/agent/manage/file", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      res.json(
        await manager.file(
          configuredAgentId.parse(req.query.agentId),
          roleFileName.parse(req.query.name),
        ),
      );
    } catch (e) {
      res.status(e instanceof z.ZodError ? 400 : 409).json({
        error:
          e instanceof z.ZodError
            ? "Choose a valid agent and supported Markdown role file."
            : (e as Error).message,
      });
    }
  });
  const post = (url: string, action: (body: unknown) => Promise<unknown>) =>
    app.post(url, async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      try {
        res.json(await action(req.body));
      } catch (e) {
        res.status(e instanceof z.ZodError ? 400 : 409).json({
          error:
            e instanceof z.ZodError
              ? "Check agent settings. Use distinct provider/model IDs and supported Markdown files."
              : (e as Error).message,
        });
      }
    });
  post("/api/agent/manage/file", (body) => manager.saveFile(body));
  post("/api/agent/manage/models", (body) => manager.saveModels(body));
  post("/api/agent/manage/name", (body) => manager.rename(body));
  post("/api/agent/manage/create", (body) => manager.create(body));
  post("/api/agent/manage/restrict", (body) => manager.restrict(body));
  post("/api/agent/manage/select", (body) => manager.select(body));
}
