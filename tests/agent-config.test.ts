import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.ts";
import { AgentConfigurationManager } from "../server/agent-config.ts";
import {
  AgentConnectionStore,
  connectionInput,
} from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import { WorkspaceService } from "../server/workspace/service.ts";
import {
  applyRoleTemplate,
  modelRoutingInput,
  type AgentRoleFile,
} from "../src/agent-config-types.ts";
import { agentConfigRuntime } from "./fixtures/agent-config.ts";

const edit = ({ missing: _missing, ...input }: AgentRoleFile) => input;

const config = {
  apiKey: "notebook-fixture",
  baseUrl: "https://api.tokenfactory.nebius.com/v1",
  model: "nvidia/test-nemotron",
};
function setup() {
  const native = agentConfigRuntime();
  const app = createApp(config, (async () => {
    throw new Error("Configuration must not run inference");
  }) as typeof fetch);
  const worker = app.locals.agent;
  const manager = new AgentConfigurationManager(worker, "nemodoc", native.run);
  return {
    native,
    worker,
    manager,
    app,
    close: async () => {
      worker.stop();
      await app.locals.workspace.ready;
      await app.locals.workspace.repository.close();
    },
  };
}

test("roles and multiple model routes are saved to native files and the correct agent without touching siblings", async () => {
  const h = setup();
  try {
    const before = structuredClone(h.native.agents.research);
    const settings = await h.manager.configuration();
    assert.equal(settings.available, true);
    assert.deepEqual(
      settings.models.map((m) => m.id),
      ["nvidia/study", "nvidia/research", "ollama/gemma"],
    );
    assert.doesNotMatch(
      JSON.stringify(settings),
      /private-native-key|sandbox\/private/,
    );
    assert.deepEqual(
      h.native.calls.find((c) => c.method === "models.list")!.params,
      { view: "configured", preparedOnly: true },
    );
    const agent = settings.agents.find((a) => a.id === "nemodoc")!;
    await h.manager.saveModels({
      agentId: agent.id,
      revision: agent.revision,
      primary: "nvidia/research",
      fallbacks: ["ollama/gemma", "nvidia/study"],
    });
    assert.deepEqual(h.native.agents.nemodoc.model, {
      primary: "nvidia/research",
      fallbacks: ["ollama/gemma", "nvidia/study"],
    });
    assert.deepEqual(h.native.agents.research, before);
    const patch = h.native.calls.find((c) => c.method === "config.patch")!;
    assert.equal(patch.params.baseHash, "1");
    assert.deepEqual(Object.keys(JSON.parse(patch.params.raw)), ["agents"]);
    const changed = (await h.manager.configuration()).agents.find(
      (a) => a.id === "nemodoc",
    )!;
    await h.manager.saveModels({
      agentId: changed.id,
      revision: changed.revision,
      primary: "",
      fallbacks: [],
    });
    assert.equal(h.native.agents.nemodoc.model, undefined);
    const reset = h.native.calls
      .filter((c) => c.method === "config.patch")
      .at(-1)!;
    assert.deepEqual(reset.params.replacePaths, [
      "agents.entries.nemodoc.model.fallbacks",
    ]);
    const file = await h.manager.file("nemodoc", "AGENTS.md");
    const content = applyRoleTemplate(file.content, "Researcher");
    await h.manager.saveFile({ ...edit(file), content });
    assert.match(
      h.native.files.get("nemodoc:AGENTS.md")!,
      /Keep existing local conventions/,
    );
    assert.match(
      h.native.files.get("nemodoc:AGENTS.md")!,
      /# Role: Researcher/,
    );
    assert.equal(
      h.native.files.get("nemodoc:SOUL.md"),
      "# Personality\n\nPatient and direct.\n",
    );
    const replaced = applyRoleTemplate(content, "Reviewer");
    assert.equal((replaced.match(/nemodoc:role:start/g) || []).length, 1);
    assert.match(replaced, /# Role: Reviewer/);
    assert.doesNotMatch(replaced, /# Role: Researcher/);
    assert.match(replaced, /Keep existing local conventions/);
  } finally {
    await h.close();
  }
});

test("stale file edits and model revisions reject writes; invalid paths and arbitrary RPC fields never reach the native CLI", async () => {
  const h = setup();
  try {
    const file = await h.manager.file("nemodoc", "AGENTS.md");
    h.native.files.set("nemodoc:AGENTS.md", "Edited from OpenClaw");
    await assert.rejects(
      h.manager.saveFile({ ...edit(file), content: "Overwrite" }),
      /changed since/,
    );
    assert.equal(
      h.native.calls.filter((c) => c.method === "agents.files.set").length,
      0,
    );
    const agent = (await h.manager.configuration()).agents[0];
    h.native.agents.nemodoc.model = { primary: "ollama/gemma" };
    await assert.rejects(
      h.manager.saveModels({
        agentId: agent.id,
        primary: "nvidia/study",
        fallbacks: [],
        revision: agent.revision,
      }),
      /models changed/,
    );
    assert.equal(
      h.native.calls.filter((c) => c.method === "config.patch").length,
      0,
    );
    const calls = h.native.calls.length;
    await assert.rejects(h.manager.file("nemodoc", "../../.env"));
    assert.throws(() =>
      h.manager.saveFile({ ...edit(file), content: "x", path: "/etc/passwd" }),
    );
    assert.throws(() =>
      h.manager.saveModels({
        agentId: "nemodoc;bad",
        primary: "nvidia/study",
        fallbacks: [],
        revision: agent.revision,
      }),
    );
    assert.throws(() =>
      h.manager.rename({
        agentId: "nemodoc",
        name: "Researcher",
        workspace: "/outside",
      }),
    );
    assert.throws(() => h.manager.create({ name: "New", method: "exec" }));
    assert.throws(() => h.manager.create({ name: "123 not a supported ID" }));
    assert.throws(() => h.manager.create({ name: "a".repeat(40) }));
    assert.equal(h.native.calls.length, calls);
    assert.equal(
      modelRoutingInput.safeParse({
        agentId: "nemodoc",
        revision: "r",
        primary: "nvidia/study",
        fallbacks: ["nvidia/study"],
      }).success,
      false,
    );
  } finally {
    await h.close();
  }
});

test("native configuration updates invalidate selected agent approvals durably, including after a retest and restart", async () => {
  const h = setup(),
    dir = mkdtempSync(path.join(tmpdir(), "nemodoc-agent-roles-"));
  try {
    const filename = path.join(dir, "connections.json");
    const store = new AgentConnectionStore(new SettingsStore(config), filename);
    store.save(
      connectionInput.parse({
        section: "model",
        mode: "openclaw",
        model: "openclaw/nemodoc",
        baseUrl: "http://127.0.0.1:18789/v1",
        apiKey: "gateway-fixture",
      }),
    );
    h.worker.connections.value.model = store.value.model;
    store.value.model.tested = true;
    const service: WorkspaceService = h.app.locals.workspace.service;
    const original = service.connection();
    const file = await h.manager.file("nemodoc", "SOUL.md");
    await h.manager.saveFile({
      ...edit(file),
      content: "# Personality\nSupportive and evidence focused.\n",
    });
    assert.equal(store.value.model.tested, false);
    store.value.model.tested = true;
    assert.notEqual(
      service.connection().configurationRevision,
      original.configurationRevision,
    );
    store.flush();
    const reloaded = new AgentConnectionStore(
      new SettingsStore(config),
      filename,
    );
    assert.equal(
      reloaded.value.model.runtimeRevision,
      store.value.model.runtimeRevision,
    );
    const revision = store.value.model.runtimeRevision;
    const other = await h.manager.file("research", "AGENTS.md");
    await h.manager.saveFile({ ...edit(other), content: "Other agent role" });
    assert.equal(store.value.model.runtimeRevision, revision);
  } finally {
    await h.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("agent creation hardens only the new agent, reports incomplete setup and never silently retries a failed write", async () => {
  const h = setup();
  try {
    const before = structuredClone(h.native.agents);
    const result = await h.manager.create({ name: "Evidence reviewer" });
    assert.equal(result.ok, true);
    assert.equal(result.agentId, "evidence-reviewer");
    const tools = h.native.agents[result.agentId].tools as any;
    assert.equal(tools.profile, "minimal");
    assert.ok(tools.deny.includes("gateway"));
    assert.ok(tools.deny.includes("group:messaging"));
    assert.deepEqual(h.native.agents.research, before.research);
    h.native.behavior.fail = "config.patch";
    const incomplete = await h.manager.create({ name: "Draft writer" });
    assert.equal(incomplete.ok, false);
    assert.match(incomplete.message, /Do not run it yet/);
    assert.ok(h.native.agents["draft-writer"]);
    assert.equal(
      h.native.calls.filter((c) => c.method === "agents.create").length,
      2,
    );
    h.native.behavior.fail = "";
    h.native.agents["draft-writer"].tools = {
      deny: ["additional_private_tool"],
    };
    await h.manager.restrict({ agentId: "draft-writer" });
    assert.equal(
      (h.native.agents["draft-writer"].tools as any).profile,
      "minimal",
    );
    assert.ok(
      (h.native.agents["draft-writer"].tools as any).deny.includes(
        "additional_private_tool",
      ),
    );
    h.native.behavior.badAck = true;
    const agent = (await h.manager.configuration()).agents[0];
    await assert.rejects(
      h.manager.saveModels({
        agentId: agent.id,
        primary: "nvidia/study",
        fallbacks: [],
        revision: agent.revision,
      }),
      /invalid acknowledgement/,
    );
  } finally {
    await h.close();
  }
});

test("a native RPC or missing catalog fails clearly without exposing raw diagnostic output", async () => {
  const h = setup();
  try {
    h.native.behavior.fail = "models.list";
    const settings = await h.manager.configuration();
    assert.equal(settings.available, true);
    assert.ok(settings.catalogError);
    assert.equal(settings.agents.length, 2);
    h.native.behavior.unavailable = true;
    const offline = await h.manager.configuration();
    assert.equal(offline.available, false);
    assert.doesNotMatch(JSON.stringify(offline), /Private runtime|credentials/);
    await assert.rejects(
      h.manager.file("nemodoc", "AGENTS.md"),
      /Could not confirm agents.files.get/,
    );
  } finally {
    await h.close();
  }
});

test("configuration HTTP APIs save native role files, scope selection, reject foreign origins and keep raw config private", async () => {
  const native = agentConfigRuntime();
  const app = createApp(
    config,
    (async () => {
      throw new Error("No inference");
    }) as typeof fetch,
    { nemoclawSandbox: "nemodoc", nemoclawReader: native.run },
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (url: string, body: unknown, origin?: string) =>
    fetch(base + url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    const response = await fetch(base + "/api/agent/manage");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const settings = await response.json();
    assert.doesNotMatch(
      JSON.stringify(settings),
      /private-native-key|workspace|path/,
    );
    const file = await fetch(
      base + "/api/agent/manage/file?agentId=nemodoc&name=AGENTS.md",
    ).then((r) => r.json());
    assert.equal(
      (
        await post("/api/agent/manage/file", {
          ...edit(file),
          content: "# Role: Reviewer",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post("/api/agent/manage/file", {
          ...edit(file),
          content: "Stale overwrite",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await post(
          "/api/agent/manage/name",
          { agentId: "research", name: "Renamed scout" },
          "https://outside.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (await fetch(base + "/api/agent/manage/file?agentId=nemodoc&name=.env"))
        .status,
      400,
    );
    assert.equal(
      (await post("/api/agent/manage/select", { agentId: "research" })).status,
      409,
    );
    const connections = app.locals.agent.connections;
    connections.save(
      connectionInput.parse({
        section: "model",
        mode: "openclaw",
        baseUrl: "http://127.0.0.1:18789/v1",
        model: "openclaw/nemodoc",
        apiKey: "gateway-fixture",
      }),
    );
    connections.value.model.tested = true;
    assert.equal(
      (await post("/api/agent/manage/select", { agentId: "research" })).status,
      200,
    );
    assert.equal(connections.value.model.model, "openclaw/research");
    assert.equal(connections.value.model.tested, false);
    assert.equal(connections.value.model.apiKey, "gateway-fixture");
  } finally {
    app.locals.agent.stop();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await app.locals.workspace.ready;
    await app.locals.workspace.repository.close();
  }
});
