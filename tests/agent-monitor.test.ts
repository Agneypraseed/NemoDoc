import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.ts";
import { snapshot, selected } from "./fixtures/evidence-workspace.ts";
import { PostgresWorkspaceRepository } from "../server/workspace/repository.ts";

const config = {
  apiKey: "notebook-fixture",
  baseUrl: "https://api.tokenfactory.nebius.com/v1",
  model: "nvidia/test-nemotron",
};
const noFetch = (async () => {
  throw new Error("Monitoring must not invoke inference");
}) as typeof fetch;
test("overview API keeps notebook runs scoped and strips credentials without loading approved PDF text", async (t) => {
  const app = createApp(config, noFetch);
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
    connection: { baseUrl: config.baseUrl, model: config.model },
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
      /Foreign private|foreign-run|private prompt|answer body|smtp-fixture-secret/,
    );
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
