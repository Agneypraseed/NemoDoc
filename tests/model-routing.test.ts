import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SettingsStore } from "../server/settings.ts";
import { AgentConnectionStore } from "../server/agent-connections.ts";
import { ResearchModels } from "../server/workspace/model-routing.ts";
import { WorkspaceService } from "../server/workspace/service.ts";
import { WorkspaceWorker } from "../server/workspace/worker.ts";
import { JsonWorkspaceRepository } from "../server/workspace/repository.ts";
import { TraceStore } from "../server/trace-store.ts";
import { snapshot } from "./fixtures/evidence-workspace.ts";
import type { ResearchPlan } from "../src/workspace-types.ts";
import type { ResearchProfile } from "../src/research-model-types.ts";
import { createApp } from "../server/app.ts";
import type { AddressInfo } from "node:net";

const profiles: ResearchProfile[] = [
  {
    id: "planner",
    name: "Small planner",
    model: "planner-small",
    baseUrl: "https://planner.example.test/v1",
    capabilities: ["planning"],
    costTier: "economy",
    strengths: "Task decomposition",
  },
  {
    id: "math",
    name: "Math specialist",
    model: "math-strong",
    baseUrl: "https://math.example.test/v1",
    capabilities: ["mathematics"],
    costTier: "premium",
    strengths: "Derivations and equations",
  },
  {
    id: "fast",
    name: "Fast researcher",
    model: "retrieval-small",
    baseUrl: "https://fast.example.test/v1",
    capabilities: ["research"],
    costTier: "economy",
    strengths: "Routine source research",
  },
  {
    id: "review",
    name: "Strong reviewer",
    model: "review-strong",
    baseUrl: "https://review.example.test/v1",
    capabilities: ["review"],
    costTier: "premium",
    strengths: "Critical synthesis",
  },
];
const selectedPlan: ResearchPlan = {
  agents: [
    {
      id: "math-task",
      name: "Mathematical researcher",
      assignment: "Derive the mathematical definition",
      role: "researcher",
      modelProfileId: "math",
      modelReason: "This task needs the declared mathematics capability.",
    },
    {
      id: "source-task",
      name: "Source researcher",
      assignment: "Find supporting source passages",
      role: "researcher",
      modelProfileId: "fast",
      modelReason: "Routine retrieval matches research and economy hints.",
    },
    {
      id: "review-task",
      name: "Reviewer",
      assignment: "Critically review the findings",
      role: "reviewer",
      modelProfileId: "review",
      modelReason: "Critical synthesis matches review strengths.",
    },
  ],
};
const input = {
  notebookId: "fixture",
  workflow: "research_team",
  executionRoute: "application",
  prompt: "Derive and compare linear maps",
  sourceIds: ["book"],
  noteIds: [],
};
function response(model: string, message: unknown) {
  return new Response(
    JSON.stringify({
      model: `${model}-served`,
      choices: [{ message }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    }),
  );
}
function fakeModels() {
  const requests: {
    model: string;
    url: string;
    purpose: string;
    input: any;
  }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body)),
      first = body.messages[0].content;
    const profile = profiles.find((p) => p.model === body.model)!;
    assert.ok(profile, `Unknown profile model ${body.model}`);
    assert.equal(String(url), `${profile.baseUrl}/chat/completions`);
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      `Bearer secret-${profile.id}`,
    );
    assert.equal(
      body.chat_template_kwargs,
      undefined,
      "A default NVIDIA template option must not leak into a different provider.",
    );
    const probe = first.includes("Call connection_probe");
    requests.push({
      model: body.model,
      url: String(url),
      purpose: probe
        ? "test"
        : first.includes("Plan research assignments only")
          ? "planner"
          : "agent",
      input: body,
    });
    const toolResults = body.messages.filter((m: any) => m.role === "tool");
    if (probe)
      return response(
        body.model,
        toolResults.length
          ? { content: JSON.parse(toolResults[0].content).receipt }
          : {
              tool_calls: [
                {
                  id: "probe",
                  type: "function",
                  function: {
                    name: "connection_probe",
                    arguments: '{"ok":true}',
                  },
                },
              ],
            },
      );
    if (first.includes("Plan research assignments only")) {
      assert.equal(body.model, "planner-small");
      const data = JSON.parse(body.messages[1].content);
      assert.equal(data.routingPriority, "cost");
      assert.deepEqual(
        data.testedModels.find((p: any) => p.id === "math").capabilities,
        ["mathematics"],
      );
      assert.ok(!JSON.stringify(data).includes("secret-"));
      return response(body.model, { content: JSON.stringify(selectedPlan) });
    }
    const task = JSON.parse(body.messages[1].content);
    if (first.includes("critical reviewer and final synthesis")) {
      assert.equal(body.model, "review-strong");
      assert.ok(task.reports.every((r: any) => r.findings));
      return response(body.model, {
        content: `The comparison is limited to the selected evidence [${task.evidence[0].id}].`,
      });
    }
    if (toolResults.length)
      return response(body.model, {
        content: `The original source supports this finding [${JSON.parse(toolResults[0].content)[0].id}].`,
      });
    return response(body.model, {
      tool_calls: [
        {
          id: `read-${body.model}`,
          type: "function",
          function: {
            name: "read_passage",
            arguments: JSON.stringify({
              sourceId: "book",
              page: body.model === "math-strong" ? 1 : 2,
            }),
          },
        },
      ],
    });
  };
  return { fetcher, requests };
}
async function setup(
  filename?: string,
  traces?: TraceStore,
  repositoryFile?: string,
) {
  const connections = new AgentConnectionStore(
    new SettingsStore({
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: "nvidia/test-nemotron",
      apiKey: "default-secret",
    }),
  );
  const models = new ResearchModels(connections, filename),
    fake = fakeModels();
  for (const p of profiles) {
    models.save({ ...p, apiKey: `secret-${p.id}` });
    await models.test(p.id, fake.fetcher);
  }
  models.preferences({ plannerProfileId: "planner", priority: "cost" });
  const repository = new JsonWorkspaceRepository(repositoryFile);
  await repository.initialize();
  const service = new WorkspaceService(
    repository,
    connections,
    undefined,
    undefined,
    undefined,
    traces,
    undefined,
    models,
  );
  await service.snapshot(snapshot);
  return { connections, models, repository, service, ...fake };
}

test("planner assigns tested models by task and the worker uses distinct models, endpoints and credentials", async () => {
  const { service, repository, fetcher, requests } = await setup();
  const plan = await service.researchPlan(input, fetcher);
  assert.deepEqual(
    plan.agents.map((a) => a.modelProfileId),
    ["math", "fast", "review"],
  );
  assert.ok(
    plan.agents.every((a) => a.modelSelection === "automatic" && a.modelReason),
  );
  await service.queue({ ...input, teamPlan: plan });
  await new WorkspaceWorker(service, fetcher).tick();
  const run = (await repository.read("fixture")).runs[0];
  assert.equal(run.status, "completed", run.error);
  assert.equal(run.plannerModel?.model, "planner-small");
  assert.deepEqual(
    run.researchTeam!.map((a) => a.assignedModel),
    ["math-strong", "retrieval-small", "review-strong"],
  );
  assert.ok(
    run.researchTeam!.every(
      (a) =>
        a.returnedModel === `${a.assignedModel}-served` && a.modelRoute?.reason,
    ),
  );
  const calls = requests.filter((r) => r.purpose === "agent");
  assert.equal(calls.length, 5);
  assert.equal(calls.at(-1)!.model, "review-strong");
  assert.ok(!JSON.stringify(run).includes("secret-"));
});

test("manual model choices override suggestions and are retained with their explanation", async () => {
  const { service, repository, fetcher } = await setup();
  const plan = await service.researchPlan(input, fetcher);
  plan.agents[0].modelProfileId = "fast";
  plan.agents[0].modelSelection = "manual";
  plan.agents[0].modelReason = "I prefer the economy model for this task.";
  await service.queue({ ...input, teamPlan: plan });
  await new WorkspaceWorker(service, fetcher).tick();
  const run = (await repository.read("fixture")).runs[0];
  assert.equal(run.status, "completed", run.error);
  assert.equal(run.researchTeam![0].assignedModel, "retrieval-small");
  assert.equal(run.researchTeam![0].modelRoute?.selection, "manual");
  assert.match(run.researchTeam![0].modelRoute!.reason, /economy/);
});

test("planner commentary cannot override server routing metadata or strict assignment validation", async () => {
  const { service } = await setup();
  const extra: typeof fetch = async () =>
    response("planner-small", {
      content: JSON.stringify({
        ...selectedPlan,
        planNotes: "A harmless explanation",
        routingRevision: "invented",
        plannerProfileId: "invented",
        planningTraceId: "invented",
      }),
    });
  const plan = await service.researchPlan(input, extra);
  assert.equal(plan.plannerProfileId, "planner");
  assert.notEqual(plan.routingRevision, "invented");
  assert.equal(plan.planningTraceId, undefined);
  assert.ok(!("planNotes" in plan));
  await assert.rejects(
    service.queue({
      ...input,
      teamPlan: { ...plan, planNotes: "API plans remain strict" },
    }),
  );
  const invalid: typeof fetch = async () =>
    response("planner-small", {
      content: JSON.stringify({
        agents: selectedPlan.agents.map((a) => ({
          ...a,
          executeCommand: "must not execute",
        })),
      }),
    });
  await assert.rejects(service.researchPlan(input, invalid));
});

test("stale plans, untested profiles, invented IDs and unsupported routing are rejected", async () => {
  const { service, models, fetcher } = await setup();
  const plan = await service.researchPlan(input, fetcher);
  models.save({ ...profiles[1], apiKey: "secret-math" });
  await assert.rejects(
    service.queue({ ...input, teamPlan: plan }),
    /configuration changed/,
  );
  await assert.rejects(
    service.queue({ ...input, teamPlan: { agents: selectedPlan.agents } }),
    /Save and test/,
  );
  await models.test("math", fetcher);
  const invented: typeof fetch = async () =>
    response("planner-small", {
      content: JSON.stringify({
        agents: selectedPlan.agents.map((a) => ({
          ...a,
          modelProfileId: "invented",
        })),
      }),
    });
  await assert.rejects(service.researchPlan(input, invented), /tested model/);
  await assert.rejects(
    service.queue({
      ...input,
      teamPlan: {
        agents: selectedPlan.agents.map((a) => ({
          ...a,
          modelProfileId: "invented",
        })),
      },
    }),
    /removed/,
  );
  await assert.rejects(
    service.queue({
      ...input,
      executionRoute: "nemoclaw",
      teamPlan: selectedPlan,
    }),
    /profiles apply/,
  );
});

test("changing or removing an assigned model stops queued work without silent fallback", async () => {
  const { service, models, repository, fetcher, requests } = await setup();
  await service.queue({ ...input, teamPlan: selectedPlan });
  const before = requests.length;
  models.remove("math");
  await new WorkspaceWorker(service, fetcher).tick();
  const run = (await repository.read("fixture")).runs[0];
  assert.equal(run.status, "failed");
  assert.match(run.error!, /removed/);
  assert.equal(requests.length, before);
});

test("profiles persist with masked credentials; changing origins clears the old credential", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "research-models-"));
  try {
    const filename = path.join(directory, "profiles.json");
    const { models, connections } = await setup(filename);
    const catalog = models.catalog();
    assert.ok(!JSON.stringify(catalog).includes("secret-"));
    const restored = new ResearchModels(connections, filename);
    assert.deepEqual(restored.catalog(), catalog);
    const old = models.snapshot("math");
    models.save({ ...profiles[1], baseUrl: "https://another.example.test/v1" });
    assert.equal(
      models.catalog().profiles.find((p) => p.id === "math")!.hasApiKey,
      false,
    );
    assert.throws(() => models.verify(old), /Save and test/);
    assert.throws(() => models.save({ ...profiles[0], id: "default" }));
    assert.throws(() =>
      models.save({ ...profiles[0], baseUrl: "http://public.example.test/v1" }),
    );
    assert.throws(() =>
      models.preferences({ plannerProfileId: "missing", priority: "cost" }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("test failures and concurrent edits cannot mark a profile as tested", async () => {
  const { models } = await setup();
  const invalid: typeof fetch = async () =>
    response("math-strong", { content: "I cannot use tools." });
  await assert.rejects(models.test("math", invalid), /required tool call/);
  assert.equal(
    models.catalog().profiles.find((p) => p.id === "math")!.tested,
    false,
  );
  const fake = fakeModels();
  let edited = false;
  const racing: typeof fetch = async (url, init) => {
    const response = await fake.fetcher(url, init);
    if (!edited) {
      models.save({ ...profiles[1], strengths: "Updated while testing" });
      edited = true;
    }
    return response;
  };
  await assert.rejects(models.test("math", racing), /changed during testing/);
  assert.equal(
    models.catalog().profiles.find((p) => p.id === "math")!.tested,
    false,
  );
});

test("routing metadata survives persistence and trace export without leaking profile keys", async (t) => {
  t.mock.method(console, "info", () => {});
  const directory = mkdtempSync(path.join(tmpdir(), "model-routing-trace-"));
  try {
    const traces = new TraceStore(
      undefined,
      path.join(directory, "trace.jsonl"),
      () => profiles.map((p) => `secret-${p.id}`),
    );
    const repositoryFile = path.join(directory, "workspace.json");
    const { service, repository, fetcher } = await setup(
      undefined,
      traces,
      repositoryFile,
    );
    const plan = await service.researchPlan(input, fetcher);
    assert.equal(
      (await traces.detail("fixture", plan.planningTraceId!))?.status,
      "completed",
    );
    const plannerEvents = await traces.events(
      "fixture",
      plan.planningTraceId!,
      0,
      500,
    );
    assert.ok(plannerEvents.events.some((e) => e.type === "model.request"));
    assert.ok(plannerEvents.events.some((e) => e.type === "plan.validated"));
    const run = await service.queue({ ...input, teamPlan: plan });
    await new WorkspaceWorker(service, fetcher, traces).tick();
    const detail = await traces.detail("fixture", run.id),
      events = await traces.events("fixture", run.id, 0, 500);
    const exported = JSON.stringify({ detail, events });
    assert.equal(detail?.metadata.planningTraceId, plan.planningTraceId);
    assert.ok(exported.includes("Math specialist"));
    assert.ok(exported.includes("mathematics capability"));
    assert.ok(!exported.includes("secret-"));
    assert.equal(
      (await repository.read("fixture")).runs[0].status,
      "completed",
    );
    const restored = new JsonWorkspaceRepository(repositoryFile);
    await restored.initialize();
    assert.deepEqual(
      (await restored.read("fixture")).runs[0],
      JSON.parse(JSON.stringify((await repository.read("fixture")).runs[0])),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failed model responses retain redacted diagnostics and completed peer findings", async (t) => {
  t.mock.method(console, "info", () => {});
  const directory = mkdtempSync(path.join(tmpdir(), "model-routing-error-"));
  try {
    const traces = new TraceStore(
      undefined,
      path.join(directory, "trace.jsonl"),
      () => profiles.map((p) => `secret-${p.id}`),
    );
    const { service, repository, fetcher } = await setup(undefined, traces);
    const run = await service.queue({ ...input, teamPlan: selectedPlan });
    const fail: typeof fetch = async (url, init) =>
      JSON.parse(String(init?.body)).model === "math-strong"
        ? new Response("Provider fixture failure secret-math", { status: 500 })
        : fetcher(url, init);
    await new WorkspaceWorker(service, fail, traces).tick();
    const saved = (await repository.read("fixture")).runs[0];
    assert.equal(saved.status, "failed");
    assert.ok(saved.researchTeam!.find((a) => a.id === "source-task")!.answer);
    const events = await traces.events("fixture", run.id, 0, 500);
    const event = events.events.find(
      (e) => e.type === "model.response" && e.payload.httpStatus === 500,
    )!;
    assert.equal(
      event.payload.errorBody,
      "Provider fixture failure [redacted]",
    );
    assert.ok(!JSON.stringify(events).includes("secret-math"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("profile HTTP APIs expose masked settings and validate saved, tested routing preferences", async () => {
  const { fetcher } = fakeModels();
  const app = createApp(
    {
      baseUrl: "https://model.example.test/v1",
      model: "nvidia/test-nemotron",
      apiKey: "fixture",
    },
    fetcher,
  );
  await app.locals.workspace.ready;
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/agent/workspace/model-profiles`;
  const post = (suffix: string, body: unknown) =>
    fetch(url + suffix, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const initial = await fetch(url);
    assert.match(initial.headers.get("cache-control")!, /no-store/);
    assert.equal((await initial.json()).profiles[0].id, "default");
    const saved = await post("", { ...profiles[0], apiKey: "secret-planner" });
    assert.equal(saved.status, 200);
    assert.ok(!(await saved.text()).includes("secret-planner"));
    assert.equal(
      (
        await post("/preferences", {
          plannerProfileId: "planner",
          priority: "cost",
        })
      ).status,
      409,
    );
    assert.equal((await post("/test", { id: "planner" })).status, 200);
    const selected = await post("/preferences", {
      plannerProfileId: "planner",
      priority: "cost",
    });
    assert.equal((await selected.json()).plannerProfileId, "planner");
    assert.equal((await post("/remove", { id: "planner" })).status, 200);
    assert.equal((await (await fetch(url)).json()).plannerProfileId, "default");
    assert.equal(
      (
        await post("", {
          ...profiles[0],
          baseUrl: "http://public.example.test",
        })
      ).status,
      400,
    );
  } finally {
    app.locals.workspace.worker.stop();
    await app.locals.workspace.repository.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
