import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PostgresWorkspaceRepository } from "../server/workspace/repository.ts";
import { WorkspaceService } from "../server/workspace/service.ts";
import { WorkspaceWorker } from "../server/workspace/worker.ts";
import { AgentConnectionStore } from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import { TraceStore } from "../server/trace-store.ts";
import {
  snapshot,
  attempt,
  selected,
  scriptedModel,
  fixedDate,
} from "./fixtures/evidence-workspace.ts";

test("PostgreSQL preserves planned research assignments, web evidence and per-agent usage", async () => {
  if (!process.env.TEST_DATABASE_URL || !process.env.TEST_READ_DATABASE_URL)
    throw new Error(
      "Use isolated TEST_DATABASE_URL and TEST_READ_DATABASE_URL values.",
    );
  const repo = new PostgresWorkspaceRepository(
    process.env.TEST_DATABASE_URL,
    process.env.TEST_READ_DATABASE_URL,
  );
  try {
    await repo.initialize();
    const notebookId = `research-${randomUUID()}`;
    const service = new WorkspaceService(
      repo,
      new AgentConnectionStore(
        new SettingsStore({
          apiKey: "fixture-key",
          baseUrl: "https://model.example.test/v1",
          model: "nvidia/test-nemotron",
        }),
      ),
    );
    await service.snapshot({ ...snapshot, notebookId });
    const teamPlan = {
      agents: [
        {
          id: "researcher",
          name: "Researcher",
          assignment: "Compare methods",
          role: "researcher",
        },
        {
          id: "reviewer",
          name: "Reviewer",
          assignment: "Check sources",
          role: "reviewer",
        },
      ],
    };
    const run = await service.queue({
      notebookId,
      workflow: "research_team",
      prompt: "Compare methods",
      sourceIds: ["book"],
      noteIds: [],
      executionRoute: "application",
      teamPlan,
    });
    await repo.transaction(notebookId, (state) => {
      const saved = state.runs.find((r) => r.id === run.id)!;
      saved.status = "completed";
      saved.stage = "completed";
      saved.webEnabled = true;
      saved.webConnectionRevision = "synthetic-revision";
      saved.webEvidence = [
        {
          id: 2,
          url: "https://example.com/synthetic",
          title: "Synthetic evidence",
          text: "Original synthetic fixture excerpt.",
          retrievedAt: fixedDate,
        },
      ];
      saved.researchTeam![0].usage = { promptTokens: 5, completionTokens: 3 };
      saved.researchTeam![0].answer = "Synthetic finding [2].";
    });
    const restored = (await repo.read(notebookId)).runs[0];
    assert.deepEqual(restored.teamPlan, teamPlan);
    assert.equal(restored.executionRoute, "application");
    assert.equal(restored.webEvidence?.[0].retrievedAt, fixedDate);
    assert.equal(restored.researchTeam?.[0].usage?.promptTokens, 5);
    assert.deepEqual((await repo.readActivity(notebookId)).runs[0], restored);
  } finally {
    await repo.close();
  }
});

test("PostgreSQL 17: migrations, SQL filters/aggregates, role boundary, approval race, rollback and recovery", async () => {
  if (!process.env.TEST_DATABASE_URL || !process.env.TEST_READ_DATABASE_URL)
    throw new Error(
      "Use an isolated TEST_DATABASE_URL and TEST_READ_DATABASE_URL. This suite intentionally refuses to silently skip.",
    );
  const repo = new PostgresWorkspaceRepository(
    process.env.TEST_DATABASE_URL,
    process.env.TEST_READ_DATABASE_URL,
  );
  const reader = new Pool({
    connectionString: process.env.TEST_READ_DATABASE_URL,
  });
  try {
    await repo.initialize();
    await repo.initialize();
    const traceDirectory = mkdtempSync(
      path.join(tmpdir(), "nemodoc-pg-trace-"),
    );
    try {
      const spool = path.join(traceDirectory, "events.jsonl");
      const traceId = randomUUID();
      const offline = new TraceStore(undefined, spool);
      const trace = await offline.start({
        traceId,
        notebookId: `trace-${traceId}`,
        runner: "personal_agent",
        name: "Spool replay fixture",
        status: "running",
        createdAt: Date.now(),
      });
      const span = await trace.span("fixture agent", "agent");
      await span.event("model.response", {
        httpStatus: 200,
        returnedModel: "nvidia/test-nemotron",
        promptTokens: 7,
        completionTokens: 3,
      });
      await span.finish("completed");
      await trace.finish("completed");
      const originalSpool = readFileSync(spool, "utf8");
      writeFileSync(spool, originalSpool + originalSpool);

      const online = new TraceStore(process.env.TEST_DATABASE_URL, spool);
      await online.initialize();
      assert.equal(online.status(), "persisted");
      await online.initialize();
      assert.equal(statSync(spool).size, 0);
      const persisted = await online.detail(`trace-${traceId}`, traceId);
      assert.equal(persisted?.status, "completed");
      assert.equal(persisted?.spans[0].status, "completed");
      const events = await online.events(`trace-${traceId}`, traceId);
      assert.equal(
        events.events.length,
        5,
        "duplicate JSONL replay must be idempotent",
      );
      const row = await repo.pool.query(
        "SELECT count(*)::int AS count FROM agent_trace_events WHERE trace_id=$1",
        [traceId],
      );
      assert.equal(row.rows[0].count, 5);
      await assert.rejects(
        repo.pool.query(
          "UPDATE agent_trace_events SET payload='{}' WHERE trace_id=$1",
          [traceId],
        ),
        /append-only/,
      );
      await assert.rejects(
        reader.query("SELECT * FROM agent_traces LIMIT 1"),
        /permission denied/,
      );
      await assert.rejects(
        reader.query("SELECT * FROM agent_trace_events LIMIT 1"),
        /permission denied/,
      );
      await online.close();
    } finally {
      rmSync(traceDirectory, { recursive: true, force: true });
    }
    const version = await repo.pool.query("SHOW server_version_num");
    assert.equal(
      Math.floor(Number(version.rows[0].server_version_num) / 10000),
      17,
    );
    const connections = new AgentConnectionStore(
      new SettingsStore({
        apiKey: "fixture",
        model: "nvidia/test-nemotron",
        baseUrl: "https://api.tokenfactory.nebius.com/v1",
      }),
    );
    const service = new WorkspaceService(repo, connections),
      worker = new WorkspaceWorker(service, scriptedModel());
    // This named fixture notebook is owned by this isolated test database only.
    await repo.pool.query("DELETE FROM workspace_notebooks WHERE id=$1", [
      snapshot.notebookId,
    ]);
    await service.snapshot(snapshot);
    assert.ok(!(await repo.runnableIds(Date.now())).includes("fixture"));
    const extracted = structuredClone(snapshot);
    extracted.sources[0].pages[0] += "\0";
    await service.snapshot(extracted);
    assert.equal(
      (await repo.read("fixture")).sources.find((s) => s.id === "book")
        ?.pages[0],
      snapshot.sources[0].pages[0],
    );
    await service.recordAttempt(attempt);
    await service.recordAttempt(attempt);
    const multipleRefs = {
      ...attempt,
      id: "multi-ref",
      answers: attempt.answers.map((q) => ({
        ...q,
        references: [
          { sourceId: "book", page: 2 },
          { sourceId: "book", page: 1 },
        ],
      })),
    };
    await service.recordAttempt(multipleRefs);
    await service.recordAttempt(multipleRefs);
    const revision = (await repo.read("fixture")).revision;
    await service.snapshot(snapshot);
    assert.equal((await repo.read("fixture")).revision, revision);
    await repo.transaction("fixture", (s) => {
      s.attempts = s.attempts.filter((a) => a.id !== "multi-ref");
    });
    await service.snapshot(snapshot);
    const scope = selected(await repo.read("fixture"));
    assert.equal(
      (
        await repo.queryNotes("fixture", scope, {
          tag: "retrieval",
          limit: 20,
        })
      ).length,
      2,
    );
    assert.equal(
      (
        await repo.queryNotes("fixture", scope, {
          since: fixedDate - 2 * 86400000,
          limit: 20,
        })
      ).length,
      3,
    );
    assert.equal(
      (
        await repo.queryNotes("fixture", scope, {
          tag: "' OR true --",
          limit: 20,
        })
      ).length,
      0,
    );
    const rows = await repo.queryProgress("fixture", scope);
    assert.equal(rows[0].answered, 2);
    assert.equal(rows[0].mistakes, 1);
    assert.deepEqual(rows[0].attemptIds, ["attempt-1"]);
    assert.deepEqual(
      await repo.queryNotes("foreign", scope, { limit: 20 }),
      [],
    );
    await assert.rejects(
      reader.query("UPDATE workspace_notes SET body='tamper'"),
      /permission denied/,
    );
    await assert.rejects(
      reader.query("SELECT * FROM workspace_notes"),
      /permission denied/,
    );
    await service.queue({
      notebookId: "fixture",
      workflow: "study_revision",
      prompt: "Prepare review materials",
      ...scope,
      includeProgress: true,
    });
    assert.ok((await repo.runnableIds(Date.now())).includes("fixture"));
    await worker.tick();
    assert.ok(!(await repo.runnableIds(Date.now())).includes("fixture"));
    let state = await repo.read("fixture");
    assert.equal(state.runs[0].status, "completed", state.runs[0].error);
    assert.equal(state.materials.length, 0);
    const p = state.proposals[0];
    const approval = {
      notebookId: "fixture",
      id: p.id,
      revision: p.revision,
      actionIds: p.actions.map((a) => a.id),
      idempotencyKey: "pg-once",
      confirm: true,
    };
    await Promise.all([service.approve(approval), service.approve(approval)]);
    state = await repo.read("fixture");
    assert.equal(state.receipts.length, 1);
    assert.equal(state.materials.length, 1);
    await assert.rejects(
      repo.transaction("fixture", (s) => {
        s.plan = "partial write";
        throw new Error("rollback");
      }),
    );
    assert.notEqual((await repo.read("fixture")).plan, "partial write");
    await service.queue({
      notebookId: "fixture",
      workflow: "research_synthesis",
      prompt: "Compare research",
      ...scope,
    });
    await worker.tick();
    state = await repo.read("fixture");
    assert.equal(state.runs[0].status, "completed", state.runs[0].error);
    await service.snapshot({ ...snapshot, notes: snapshot.notes.slice(1) });
    state = await repo.read("fixture");
    assert.equal(
      state.proposals.filter((p) => p.status === "pending").length,
      0,
    );
    await repo.transaction("fixture", (s) => {
      s.runs[0].status = "running";
      s.outbox.push({
        id: "uncertain",
        proposalId: p.id,
        actionId: "uncertain",
        target: {
          channel: "email",
          recipient: "test@example.com",
          revision: "fixture",
        },
        title: "Fixture",
        text: "Fixture",
        status: "sending",
        createdAt: fixedDate,
      });
    });
    await worker.recover();
    await worker.dispatch("fixture");
    state = await repo.read("fixture");
    assert.equal(state.outbox[0].status, "unknown");
    assert.equal(state.runs[0].status, "interrupted");
  } finally {
    await reader.end();
    await repo.close();
  }
});
