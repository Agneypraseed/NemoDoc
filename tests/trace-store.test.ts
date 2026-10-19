import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TraceStore } from "../server/trace-store.ts";

test("trace spool is redacted, incrementally readable, measurable, and restart safe", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-traces-"));
  const spool = path.join(directory, "agent-traces.jsonl");
  const secret = "nvidia-test-secret-do-not-store";
  const log = t.mock.method(console, "info", () => {});
  try {
    const store = new TraceStore(undefined, spool, () => [secret]);
    const traceId = randomUUID();
    const trace = await store.start({
      traceId,
      notebookId: "trace-fixture",
      runner: "evidence_workflow",
      name: "PCA research",
      status: "running",
      createdAt: Date.now(),
      metadata: { model: "nvidia/test-nemotron" },
    });
    const agent = await trace.span("Foundations researcher", "agent", {
      attributes: { agentId: "foundations" },
    });
    const model = await trace.span("Model request", "model_call", {
      parentSpanId: agent.spanId,
      attempt: 1,
    });
    await model.event("model.request", {
      url: "https://gateway.example/v1/chat/completions",
      request: {
        messages: [
          { role: "user", content: `PCA in neural networks; key=${secret}` },
        ],
        analysis: "private reasoning must be omitted",
        api_key: secret,
      },
    });
    await trace.event("tool.call", {
      agentId: "foundations",
      tool: "read_passage",
      arguments: { sourceId: "mml", page: 12 },
      result: { excerpt: "The approved page excerpt is retained locally." },
    });
    await model.event("model.response", {
      httpStatus: 200,
      returnedModel: "nvidia/test-nemotron",
      requestId: "req-fixture",
      finishReason: "stop",
      promptTokens: 41,
      completionTokens: 17,
      response: {
        choices: [
          {
            message: {
              content: "PCA projects onto principal directions [1].",
              reasoning_content: "private model reasoning must be omitted",
            },
          },
        ],
      },
    });
    await model.finish("completed");
    await agent.finish("completed");
    await trace.finish("completed");

    assert.equal(store.status(), "degraded");
    const raw = readFileSync(spool, "utf8");
    assert.ok(raw.includes("PCA in neural networks"));
    assert.ok(raw.includes("approved page excerpt"));
    assert.ok(raw.includes("PCA projects onto principal directions"));
    assert.ok(!raw.includes(secret));
    assert.ok(!raw.includes("private reasoning"));
    assert.ok(!raw.includes("reasoning_content"));

    const firstPage = await store.events("trace-fixture", traceId, 0, 3);
    assert.deepEqual(
      firstPage.events.map((event) => event.sequence),
      [1, 2, 3],
    );
    const secondPage = await store.events(
      "trace-fixture",
      traceId,
      firstPage.nextCursor,
      100,
    );
    assert.ok(secondPage.events.length > 0);
    assert.ok(
      secondPage.events.every((event) => event.sequence > firstPage.nextCursor),
    );
    const detail = await store.detail("trace-fixture", traceId);
    assert.equal(detail?.status, "completed");
    assert.ok(detail?.spans.every((span) => span.status === "completed"));
    const metrics = await store.metrics("trace-fixture");
    assert.equal(metrics.modelCalls, 1);
    assert.equal(metrics.toolCalls, 1);
    assert.equal(metrics.failureRate, 0);
    assert.equal(metrics.interruptionRate, 0);
    assert.equal(metrics.promptTokens, 41);
    assert.equal(metrics.completionTokens, 17);
    assert.equal(log.mock.callCount(), 9);

    const interruptedId = randomUUID();
    const interrupted = await store.start({
      traceId: interruptedId,
      notebookId: "trace-fixture",
      runner: "personal_agent",
      name: "Interrupted manual task",
      status: "running",
      createdAt: Date.now(),
    });
    const openSpan = await interrupted.span("Scheduled agent", "agent");
    const recoveredStore = new TraceStore(undefined, spool, () => [secret]);
    await recoveredStore.markInterrupted(
      interruptedId,
      "trace-fixture",
      "Server stopped during this agent run.",
    );
    const recovered = await recoveredStore.detail(
      "trace-fixture",
      interruptedId,
    );
    assert.equal(recovered?.status, "interrupted");
    assert.equal(
      recovered?.spans.find((span) => span.spanId === openSpan.spanId)?.status,
      "interrupted",
    );
    assert.equal(
      recovered?.spans.find((span) => span.spanId === openSpan.spanId)
        ?.attributes.recoveredAfterRestart,
      true,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
