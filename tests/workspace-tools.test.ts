import test from "node:test";
import assert from "node:assert/strict";
import { JsonWorkspaceRepository } from "../server/workspace/repository.ts";
import { WorkspaceService } from "../server/workspace/service.ts";
import { AgentConnectionStore } from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import { executeReadTool } from "../server/workspace/read-tools.ts";
import { snapshot } from "./fixtures/evidence-workspace.ts";
test("read tools independently enforce notebook, selected source, note and progress boundaries", async () => {
  const repo = new JsonWorkspaceRepository();
  await repo.initialize();
  const service = new WorkspaceService(
    repo,
    new AgentConnectionStore(
      new SettingsStore({
        apiKey: "fixture",
        baseUrl: "https://api.tokenfactory.nebius.com/v1",
        model: "nvidia/test-nemotron",
      }),
    ),
  );
  await service.snapshot(snapshot);
  const run = await service.queue({
    notebookId: "fixture",
    workflow: "study_revision",
    prompt: "Read basis",
    sourceIds: ["book"],
    noteIds: ["basis"],
  });
  const state = await repo.read("fixture");
  await assert.rejects(
    executeReadTool(
      repo,
      run,
      { ...state, notebookId: "foreign" },
      "read_passage",
      { sourceId: "book", page: 1 },
      Date.now(),
    ),
  );
  await assert.rejects(
    executeReadTool(
      repo,
      run,
      state,
      "read_passage",
      { sourceId: "paper-a", page: 1 },
      Date.now(),
    ),
  );
  await assert.rejects(
    executeReadTool(
      repo,
      run,
      state,
      "query_notes",
      { notebookId: "foreign" },
      Date.now(),
    ),
  );
  await assert.rejects(
    executeReadTool(
      repo,
      run,
      state,
      "query_notes",
      { sourceId: "paper-a" },
      Date.now(),
    ),
  );
  await assert.rejects(
    executeReadTool(repo, run, state, "query_quiz_progress", {}, Date.now()),
  );
  const notes = await executeReadTool(
    repo,
    run,
    state,
    "query_notes",
    {},
    Date.now(),
  );
  assert.equal((notes.output as { records: unknown[] }).records.length, 1);
  const result = await executeReadTool(
    repo,
    run,
    state,
    "search_sources",
    { query: "optimization step" },
    Date.now(),
  );
  assert.ok(
    (result.output as { sourceId: string }[]).every(
      (c) => c.sourceId === "book",
    ),
  );
});
