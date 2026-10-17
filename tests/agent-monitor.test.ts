import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { AgentRuntimeMonitor } from "../server/agent-monitor.ts";
import {
  AgentConnectionStore,
  connectionInput,
} from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import { createApp } from "../server/app.ts";
import {
  runtimeRoster,
  runtimeSessions,
  runtimeReader,
} from "./fixtures/agent-monitor.ts";
import { snapshot, selected } from "./fixtures/evidence-workspace.ts";
import { PostgresWorkspaceRepository } from "../server/workspace/repository.ts";

const config = {
  apiKey: "notebook-fixture",
  baseUrl: "https://api.tokenfactory.nebius.com/v1",
  model: "nvidia/test-nemotron",
};
const connections = () => new AgentConnectionStore(new SettingsStore(config));
const noFetch = (async () => {
  throw new Error("Monitoring must not invoke inference");
}) as typeof fetch;

test("native monitoring reads only the roster and bounded session RPC, stripping paths, transcripts and hidden sessions", async () => {
  const calls: string[][] = [];
  const monitor = new AgentRuntimeMonitor(
    connections(),
    noFetch,
    "nemodoc",
    async (args) => {
      calls.push(args);
      return JSON.stringify(
        args.includes("agents")
          ? runtimeRoster
          : {
              ...runtimeSessions,
              sessions: [
                ...runtimeSessions.sessions,
                {
                  key: "agent:nemodoc:stale",
                  status: "running",
                  hasActiveRun: false,
                },
                { key: "agent:nemodoc:unknown", updatedAt: Date.now() },
                {
                  key: "agent:nemodoc:nemoclaw-onboard-warmup-hidden",
                  status: "done",
                },
                { key: "agent:foreign:other", status: "running" },
                { key: "global:secret", status: "running" },
              ],
            },
      );
    },
  );
  const result = await monitor.snapshot();
  assert.equal(result.status, "connected");
  assert.equal(result.agents.length, 3);
  assert.equal(result.agents[0].name, "Study partner");
  assert.deepEqual(
    result.activity.map((row) => row.status),
    ["running", "waiting", "failed", "unknown", "unknown"],
  );
  assert.equal(
    result.activity[0].summary,
    "Reading selected notes and checking citations",
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-path|apiKey|never-return|warmup|private gateway diagnostic|agent:nemodoc:study/,
  );
  assert.deepEqual(calls[0], ["nemodoc", "agents", "list", "--json"]);
  assert.deepEqual(calls[1].slice(0, 7), [
    "nemodoc",
    "exec",
    "--",
    "openclaw",
    "gateway",
    "call",
    "sessions.list",
  ]);
  assert.deepEqual(JSON.parse(calls[1][8]), {
    limit: 100,
    includeGlobal: false,
    includeUnknown: false,
    includeDerivedTitles: false,
    includeLastMessage: false,
  });
  await monitor.snapshot();
  assert.equal(calls.length, 2, "polls within five seconds reuse the snapshot");
});

test("concurrent monitor polls share native reads and unknown failures never become an idle status", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const monitor = new AgentRuntimeMonitor(
    connections(),
    noFetch,
    "nemodoc",
    async (args) => {
      calls++;
      await gate;
      if (!args.includes("agents")) throw new Error("secret diagnostic");
      return JSON.stringify(runtimeRoster);
    },
  );
  const a = monitor.snapshot(),
    b = monitor.snapshot();
  release();
  const [one, two] = await Promise.all([a, b]);
  assert.equal(one, two);
  assert.equal(calls, 2);
  assert.equal(one.status, "partial");
  assert.equal(one.agents.length, 3);
  assert.deepEqual(one.activity, []);
  assert.doesNotMatch(one.message, /secret diagnostic/);
});

test("native failure replaces previous running data on the next poll", async (t) => {
  let now = Date.now(),
    fail = false;
  t.mock.method(Date, "now", () => now);
  const monitor = new AgentRuntimeMonitor(
    connections(),
    noFetch,
    "nemodoc",
    async (args) => {
      if (fail) throw new Error("private failure");
      return runtimeReader(args);
    },
  );
  assert.equal((await monitor.snapshot()).activity[0].status, "running");
  fail = true;
  now += 5001;
  const snapshot = await monitor.snapshot();
  assert.equal(snapshot.status, "unavailable");
  assert.deepEqual(snapshot.activity, []);
  assert.deepEqual(snapshot.agents, []);
});

test("remote gateway inventory uses the saved bearer token but never claims live activity", async () => {
  const store = connections();
  store.save(
    connectionInput.parse({
      section: "model",
      mode: "openclaw",
      baseUrl: "https://runtime.example.com/v1",
      model: "openclaw/nemodoc",
      apiKey: "gateway-fixture",
    }),
  );
  let calls = 0;
  const fetcher = (async (url, init) => {
    calls++;
    assert.equal(url, "https://runtime.example.com/v1/models");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer gateway-fixture",
    );
    assert.equal(init?.redirect, "error");
    assert.equal(init?.body, undefined);
    return Response.json({
      data: [
        { id: "openclaw/nemodoc" },
        { id: "openclaw/research" },
        { id: "openclaw/research" },
        { id: "nvidia/a-model" },
      ],
    });
  }) as typeof fetch;
  const monitor = new AgentRuntimeMonitor(store, fetcher);
  const result = await monitor.snapshot();
  assert.equal(result.status, "partial");
  assert.equal(result.source, "gateway");
  assert.deepEqual(
    result.agents.map((a) => a.id),
    ["nemodoc", "research"],
  );
  assert.deepEqual(result.activity, []);
  assert.equal(calls, 1);
  store.save(
    connectionInput.parse({
      section: "model",
      mode: "openclaw",
      baseUrl: "https://runtime.example.com/v1",
      model: "openclaw/nemodoc",
      clearApiKey: true,
    }),
  );
  assert.equal((await monitor.snapshot()).status, "not_configured");
  assert.equal(
    calls,
    1,
    "a cleared token must invalidate the cached roster and prevent requests",
  );
});

test("invalid sandbox arguments and malformed output do not dispatch arbitrary commands or invent agents", async () => {
  let calls = 0;
  const reader = async () => {
    calls++;
    return "not JSON: secret diagnostics";
  };
  assert.equal(
    (
      await new AgentRuntimeMonitor(
        connections(),
        noFetch,
        "name; touch /tmp/injected",
        reader,
      ).snapshot()
    ).status,
    "unavailable",
  );
  assert.equal(calls, 0);
  const failed = await new AgentRuntimeMonitor(
    connections(),
    noFetch,
    "nemodoc",
    reader,
  ).snapshot();
  assert.equal(failed.status, "unavailable");
  assert.deepEqual(failed.agents, []);
  assert.doesNotMatch(JSON.stringify(failed), /secret diagnostics/);
});

test("overview API keeps notebook runs scoped and strips credentials without loading approved PDF text", async (t) => {
  const calls: string[][] = [];
  const app = createApp(config, noFetch, {
    nemoclawSandbox: "nemodoc",
    nemoclawReader: async (args) => {
      calls.push(args);
      return runtimeReader(args);
    },
  });
  await app.locals.workspace.ready;
  const worker = app.locals.agent;
  worker.connections.value.email.password = "smtp-fixture-secret";
  worker.data.state.runs.push({
    id: "local-run",
    taskId: "task",
    notebookId: "fixture",
    title: "Revision smtp-fixture-secret",
    status: "running",
    startedAt: 10,
    answer: "Do not expose answer body",
    connection: { baseUrl: config.baseUrl, model: "openclaw/nemodoc" },
    steps: [
      { tool: "search_sources", summary: "Reading chosen notes", at: 12 },
    ],
    citations: [],
    materials: [],
    sent: { memoryIds: [], sourceIds: [], skill: "", prompt: "private prompt" },
    calls: 1,
  });
  worker.data.state.runs.push({
    ...worker.data.state.runs[0],
    id: "foreign-run",
    notebookId: "foreign",
    title: "Foreign private task",
  });
  const service = app.locals.workspace.service;
  await service.snapshot(snapshot);
  await service.queue({
    notebookId: "fixture",
    workflow: "study_revision",
    prompt: "Prepare revision",
    ...selected(await service.repository.read("fixture")),
  });
  const fullRead = t.mock.method(service.repository, "read", async () => {
    throw new Error("Dashboard must not load PDF pages");
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(base + "/api/agent/overview")).status, 400);
    const response = await fetch(
      base +
        "/api/agent/overview?notebookId=fixture&command=destroy&sandbox=other",
    );
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const data = await response.json();
    assert.equal(data.runtime.agents.length, 3);
    assert.equal(data.notebookActivity.length, 2);
    assert.equal(fullRead.mock.callCount(), 0);
    assert.ok(
      data.notebookActivity.some(
        (row: any) => row.status === "queued" && row.kind === "workflow",
      ),
    );
    assert.ok(
      data.notebookActivity.some(
        (row: any) =>
          row.title === "Revision [redacted]" &&
          row.steps[0].tool === "search_sources",
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(data),
      /Foreign private|foreign-run|private prompt|answer body|smtp-fixture-secret|private-path|never-return/,
    );
    assert.ok(calls.every((args) => args[0] === "nemodoc"));
  } finally {
    worker.stop();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await service.repository.close();
  }
});

test("PostgreSQL activity polling reads bounded lifecycle tables in a consistent read-only transaction", async (t) => {
  const repo = new PostgresWorkspaceRepository(
    "postgresql://localhost/not-used",
    "postgresql://localhost/not-used",
  );
  const queries: { sql: string; values?: unknown[] }[] = [];
  let released = false;
  t.mock.method(
    repo.pool,
    "connect",
    async () =>
      ({
        query: async (sql: string, values?: unknown[]) => {
          queries.push({ sql, values });
          return {
            rows: sql.startsWith("SELECT payload FROM workspace_runs")
              ? [{ payload: { id: "run-a" } }]
              : [],
          };
        },
        release: () => {
          released = true;
        },
      }) as any,
  );
  try {
    const result = await repo.readActivity("notebook-a");
    assert.equal(result.runs[0].id, "run-a");
    assert.equal(
      queries[0].sql,
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    assert.equal(queries.at(-1)!.sql, "COMMIT");
    assert.match(queries[1].sql, /ORDER BY created_at DESC,id LIMIT 50/);
    assert.deepEqual(queries[1].values, ["notebook-a"]);
    assert.deepEqual(queries[2].values, ["notebook-a", ["run-a"]]);
    assert.ok(
      queries.slice(1, -1).every((q) => q.sql.includes("notebook_id=$1")),
    );
    assert.doesNotMatch(
      queries.map((q) => q.sql).join("\n"),
      /workspace_pages|workspace_notes|workspace_quiz_answers/,
    );
    assert.equal(released, true);
  } finally {
    await repo.close();
  }
});
