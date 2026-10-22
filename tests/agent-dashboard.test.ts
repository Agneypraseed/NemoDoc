import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.ts";
import { TraceStore } from "../server/trace-store.ts";
import {
  estimatedCost,
  readDashboardPrices,
  summarizeDashboard,
} from "../src/lib/agent-dashboard.ts";

test("dashboard aggregates scoped persisted calls, preserves unknown usage, and exposes no content or secrets", async (t) => {
  t.mock.method(console, "info", () => {});
  const dir = mkdtempSync(path.join(tmpdir(), "nemodoc-dashboard-"));
  const spool = path.join(dir, "traces.jsonl");
  const store = new TraceStore(undefined, spool, () => ["private-fixture-key"]);
  const now = Date.now();
  try {
    for (const notebookId of ["included", "other"]) {
      const trace = await store.start({
        traceId: randomUUID(),
        notebookId,
        runner: "evidence_workflow",
        name: "Research team",
        status: "running",
        createdAt: now,
        metadata: { workflow: "research_team" },
      });
      for (const [model, missing] of [
        ["lightning", false],
        ["ultra", true],
        ["ultra", false],
      ] as const) {
        const span = await trace.span("Model request", "model_call", {
          attempt: 1,
        });
        await span.event("model.request", {
          model,
          url: "https://example.test/v1/chat/completions?api_key=private-fixture-key",
          request: { messages: [{ content: "private document excerpt" }] },
        });
        await span.event(
          "model.response",
          missing
            ? { httpStatus: 500, errorBody: "private provider content" }
            : {
                httpStatus: 200,
                promptTokens: 100,
                completionTokens: 20,
                response: { text: "private answer" },
              },
        );
        await span.finish(missing ? "failed" : "completed");
      }
      await trace.event("tool.call", { tool: "read_passage" });
      await trace.event("citation.validation", { valid: false });
      await trace.finish("failed");
    }
    const recovered = new TraceStore(undefined, spool);
    const result = await recovered.dashboard("included", now - 1, now + 10000);
    assert.equal(result.traces.length, 1);
    assert.equal(result.truncated, false);
    const trace = result.traces[0];
    assert.equal(trace.kind, "research");
    assert.equal(trace.status, "failed");
    assert.equal(trace.toolCalls, 1);
    assert.equal(trace.citationChecksFailed, 1);
    const usage = summarizeDashboard(result.traces);
    assert.equal(usage.calls, 3);
    assert.equal(usage.tokens, 240);
    assert.equal(usage.usageReports, 2);
    assert.equal(usage.models.find((m) => m.model === "ultra")!.failed, 1);
    assert.equal(
      summarizeDashboard(result.traces, usage.models[0].key).calls,
      2,
    );
    const raw = JSON.stringify(result);
    for (const forbidden of [
      "private-fixture-key",
      "private document",
      "private answer",
      "private provider",
      "api_key",
    ])
      assert.ok(!raw.includes(forbidden));
    assert.equal(
      (await recovered.dashboard("included", now + 1, now + 10000)).traces
        .length,
      0,
    );
    assert.equal(
      (await recovered.dashboard("nonexistent", 0, now + 10000)).traces.length,
      0,
    );
    for (const model of usage.models) {
      assert.equal(estimatedCost(model, {}), null);
      const cost = estimatedCost(model, {
        [model.key]: { inputPerMillion: 1, outputPerMillion: 2 },
      });
      assert.equal(cost, model.model === "ultra" ? null : 0.00014);
    }
    assert.deepEqual(
      readDashboardPrices('{"x":{"inputPerMillion":-1,"outputPerMillion":0}}'),
      {},
    );
    assert.deepEqual(readDashboardPrices("bad JSON"), {});
    assert.deepEqual(
      readDashboardPrices('{"x":{"inputPerMillion":0,"outputPerMillion":0}}'),
      { x: { inputPerMillion: 0, outputPerMillion: 0 } },
    );
  } finally {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dashboard HTTP rejects invalid ranges and scopes histories", async (t) => {
  t.mock.method(console, "info", () => {});
  const dir = mkdtempSync(path.join(tmpdir(), "nemodoc-dashboard-api-"));
  const app = createApp(
    {
      apiKey: "",
      baseUrl: "https://example.test/v1",
      model: "nvidia/test-nemotron",
    },
    async () => {
      throw new Error("Dashboard must not call inference");
    },
    {
      agentFile: path.join(dir, "agent.json"),
      workspaceFile: path.join(dir, "workspace.json"),
      startWorkspaceWorker: false,
    },
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/agent/workspace`;
  try {
    const trace = await app.locals.traceStore.start({
      traceId: randomUUID(),
      notebookId: "mine",
      runner: "personal_agent",
      name: "Study",
      status: "completed",
      createdAt: Date.now(),
    });
    await trace.finish("completed");
    const response = await fetch(`${base}/mine/dashboard`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).traces.length, 1);
    assert.equal(
      (await (await fetch(`${base}/other/dashboard`)).json()).traces.length,
      0,
    );
    for (const query of [
      "since=-1",
      "since=500&until=1",
      "since=0&until=9999999999999",
      "since=oops",
    ])
      assert.equal(
        (await fetch(`${base}/mine/dashboard?${query}`)).status,
        400,
      );
  } finally {
    app.locals.workspace.worker.stop();
    await app.locals.workspace.repository.close();
    await app.locals.traceStore.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});
