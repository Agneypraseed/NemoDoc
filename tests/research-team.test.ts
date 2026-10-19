import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AgentConnectionStore } from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import { TraceStore } from "../server/trace-store.ts";
import { JsonWorkspaceRepository } from "../server/workspace/repository.ts";
import {
  WorkspaceService,
  type RuntimeResearchTarget,
} from "../server/workspace/service.ts";
import { WorkspaceWorker } from "../server/workspace/worker.ts";
import { selected, snapshot } from "./fixtures/evidence-workspace.ts";

const targets: RuntimeResearchTarget[] = [
  { id: "foundations", model: "nvidia/test-nemotron", fallbacks: [] },
  { id: "neural-networks", model: "nvidia/test-nemotron", fallbacks: [] },
  { id: "critical-review", model: "nvidia/test-nemotron", fallbacks: [] },
];
const gateway = "http://127.0.0.1:18789/v1";

async function setup(configuredTargets = targets, traces?: TraceStore) {
  const repo = new JsonWorkspaceRepository();
  await repo.initialize();
  const connections = new AgentConnectionStore(
    new SettingsStore({
      apiKey: "unused-notebook-key",
      baseUrl: "https://api.example.test/v1",
      model: "nvidia/test-nemotron",
    }),
  );
  connections.value.model = {
    mode: "openclaw",
    baseUrl: gateway,
    model: "openclaw/foundations",
    apiKey: "private-gateway-token",
    tested: true,
  };
  const service = new WorkspaceService(
    repo,
    connections,
    undefined,
    async () => configuredTargets,
    "nvidia/test-nemotron",
    traces,
  );
  await service.snapshot(snapshot);
  return { repo, connections, service };
}

function response(message: unknown, model = "nvidia/test-nemotron") {
  return new Response(
    JSON.stringify({
      id: "response-fixture",
      model,
      choices: [{ message, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    }),
    {
      headers: {
        "content-type": "application/json",
        "x-request-id": "request-fixture",
      },
    },
  );
}

function threeAgentFetcher(
  options: {
    waitForAll?: boolean;
    badCitations?: boolean;
    started?: Promise<void>;
    release?: Promise<void>;
    onRequest?: (model: string) => void;
  } = {},
) {
  const firstRequests = new Set<string>();
  let ready!: () => void;
  const allFirstRequests = new Promise<void>((resolve) => (ready = resolve));
  return {
    fetcher: (async (url, init) => {
      assert.equal(String(url), `${gateway}/chat/completions`);
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer private-gateway-token",
      );
      const body = JSON.parse(String(init?.body));
      const target = body.model as string;
      options.onRequest?.(target);
      const system = body.messages[0].content as string;
      const synthesis = system.includes(
        "You are NemoDoc's critical reviewer and final synthesis author.",
      );
      if (synthesis) {
        const input = JSON.parse(body.messages[1].content);
        const citation = input.approvedEvidence[0].citation.match(/\d+/)?.[0];
        return response({
          content: `PCA is described by the selected page [${citation}]. The MML evidence cannot establish how neural networks are trained or generalize.`,
        });
      }
      const toolMessages = body.messages.filter(
        (message: any) => message.role === "tool",
      );
      if (toolMessages.length) {
        const output = JSON.parse(toolMessages.at(-1).content);
        const citation = Array.isArray(output) ? output[0]?.id : output?.id;
        const ref = options.badCitations ? 999 : citation;
        return response({
          content: `The selected passage supports this research finding [${ref}].`,
        });
      }
      firstRequests.add(target);
      if (firstRequests.size === 3) ready();
      if (options.waitForAll) {
        options.started && (await options.started);
        await allFirstRequests;
        await options.release;
      }
      const agentId = target.split("/").at(-1);
      const sourceId =
        agentId === "foundations"
          ? "book"
          : agentId === "neural-networks"
            ? "book"
            : "paper-a";
      const page = agentId === "neural-networks" ? 2 : 1;
      assert.deepEqual(
        body.tools.map((tool: any) => tool.function.name),
        ["search_sources", "read_passage"],
      );
      return response({
        content: null,
        tool_calls: [
          {
            id: `read-${agentId}`,
            type: "function",
            function: {
              name: "read_passage",
              arguments: JSON.stringify({ sourceId, page }),
            },
          },
        ],
      });
    }) as typeof fetch,
    firstRequests,
  };
}

test("three-agent research routes concurrently through distinct verified NemoClaw targets", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-team-"));
  const log = t.mock.method(console, "info", () => {});
  const traces = new TraceStore(
    undefined,
    path.join(directory, "trace.jsonl"),
    () => ["private-gateway-token"],
  );
  const { repo, service } = await setup(targets, traces);
  try {
    let inferenceRequests = 0;
    const prerequisites = await service.researchPrerequisites();
    assert.equal(prerequisites.available, true);
    assert.equal(
      inferenceRequests,
      0,
      "overview prerequisites must not call inference",
    );
    const fetch = threeAgentFetcher({
      onRequest: (model) => {
        inferenceRequests++;
        assert.match(
          model,
          /^openclaw\/(foundations|neural-networks|critical-review)$/,
        );
      },
    });
    const run = await service.queue({
      notebookId: "fixture",
      workflow: "research_team",
      prompt: "Research PCA in neural networks using only the selected pages.",
      ...selected(await repo.read("fixture")),
      agentIds: targets.map((target) => target.id),
    });
    await new WorkspaceWorker(service, fetch.fetcher, traces).tick();
    const state = await repo.read("fixture");
    assert.equal(state.runs[0].id, run.id);
    assert.equal(state.runs[0].status, "completed", state.runs[0].error);
    assert.equal(
      state.runs[0].researchTeam?.filter(
        (agent) => agent.status === "completed",
      ).length,
      3,
    );
    assert.match(state.runs[0].answer, /cannot establish.*neural networks/i);
    assert.equal(
      inferenceRequests,
      7,
      "each specialist uses two calls and the reviewer synthesizes once",
    );
    assert.equal(
      fetch.firstRequests.size,
      3,
      "all specialists begin before any returns",
    );
    assert.equal(state.runs[0].citations.length, 3);
    assert.ok(
      new Set(state.runs[0].citations.map((citation) => citation.id)).size ===
        3,
    );

    const history = await traces.events("fixture", run.traceId!, 0, 1000);
    assert.deepEqual(
      history.events.map((event) => event.sequence),
      history.events.map((_event, index) => index + 1),
    );
    assert.equal(
      history.events.filter((event) => event.type === "model.request").length,
      7,
    );
    assert.equal(
      history.events.filter((event) => event.type === "model.response").length,
      7,
    );
    assert.equal(
      history.events.filter((event) => event.type === "tool.call").length,
      3,
    );
    assert.equal(
      history.events.filter(
        (event) =>
          event.type === "citation.validation" && event.payload.valid === true,
      ).length,
      4,
    );
    assert.equal((await traces.metrics("fixture")).modelCalls, 7);
    assert.equal(log.mock.callCount(), history.events.length);
    assert.ok(fetch.firstRequests.has("openclaw/foundations"));
    assert.ok(fetch.firstRequests.has("openclaw/neural-networks"));
    assert.ok(fetch.firstRequests.has("openclaw/critical-review"));
  } finally {
    await repo.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("research rejects unverified targets and a provider fallback outside NVIDIA", async () => {
  const invalidTargets = targets.map((target, index) =>
    index === 2 ? { ...target, fallbacks: ["nebius/other-model"] } : target,
  );
  const { repo, service } = await setup(invalidTargets);
  try {
    const prerequisites = await service.researchPrerequisites();
    assert.equal(prerequisites.available, false);
    assert.equal(prerequisites.targets[2].verified, false);
    await assert.rejects(
      service.queue({
        notebookId: "fixture",
        workflow: "research_team",
        prompt: "PCA in neural networks",
        ...selected(await repo.read("fixture")),
        agentIds: targets.map((target) => target.id),
      }),
      /NVIDIA-only fallback routes/,
    );
  } finally {
    await repo.close();
  }
});

test("source revocation during inference prevents returned tool calls and preserves the failed trace", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-revoked-"));
  const traces = new TraceStore(undefined, path.join(directory, "trace.jsonl"));
  const { repo, service } = await setup(targets, traces);
  let announceStarted!: () => void;
  let releaseModels!: () => void;
  const started = new Promise<void>((resolve) => (announceStarted = resolve));
  const release = new Promise<void>((resolve) => (releaseModels = resolve));
  const fake = threeAgentFetcher({
    waitForAll: true,
    started: Promise.resolve(),
    release,
    onRequest: () => {
      if (fake.firstRequests.size === 2) announceStarted();
    },
  });
  try {
    const run = await service.queue({
      notebookId: "fixture",
      workflow: "research_team",
      prompt: "PCA in neural networks",
      ...selected(await repo.read("fixture")),
      agentIds: targets.map((target) => target.id),
    });
    const running = new WorkspaceWorker(service, fake.fetcher, traces).tick();
    await started;
    await service.revoke("fixture");
    releaseModels();
    await running;
    const state = await repo.read("fixture");
    assert.equal(state.runs[0].status, "failed");
    assert.equal(state.runs[0].citations.length, 0);
    const events = await traces.events("fixture", run.traceId!, 0, 1000);
    assert.equal(
      events.events.filter((event) => event.type === "model.response").length,
      3,
    );
    assert.equal(
      events.events.filter((event) => event.type === "tool.call").length,
      0,
    );
    assert.equal(
      (await traces.detail("fixture", run.traceId!))?.status,
      "failed",
    );
  } finally {
    releaseModels();
    await repo.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("three-agent citation rejection is recorded and cannot produce a synthesis", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-citations-"));
  const log = t.mock.method(console, "info", () => {});
  const traces = new TraceStore(undefined, path.join(directory, "trace.jsonl"));
  const { repo, service } = await setup(targets, traces);
  try {
    const run = await service.queue({
      notebookId: "fixture",
      workflow: "research_team",
      prompt: "PCA in neural networks",
      ...selected(await repo.read("fixture")),
      agentIds: targets.map((target) => target.id),
    });
    await new WorkspaceWorker(
      service,
      threeAgentFetcher({ badCitations: true }).fetcher,
      traces,
    ).tick();
    const state = await repo.read("fixture");
    assert.equal(state.runs[0].status, "failed");
    assert.equal(state.runs[0].answer, "");
    const events = await traces.events("fixture", run.traceId!, 0, 2000);
    assert.ok(
      events.events.some(
        (event) =>
          event.type === "citation.validation" && event.payload.valid === false,
      ),
    );
    assert.equal(
      events.events.filter((event) => event.type === "model.request").length,
      9,
    );
    assert.equal(log.mock.callCount(), events.events.length);
  } finally {
    await repo.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
