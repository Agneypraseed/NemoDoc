import test from "node:test";
import assert from "node:assert/strict";
import { JsonWorkspaceRepository } from "../server/workspace/repository.ts";
import { WorkspaceService } from "../server/workspace/service.ts";
import { WorkspaceWorker } from "../server/workspace/worker.ts";
import { AgentConnectionStore } from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import { legacySnapshots } from "../server/workspace/import.ts";
import {
  snapshot,
  selected,
  scriptedModel,
} from "./fixtures/evidence-workspace.ts";
test("approved review survives restart and generates one new proposal without recursively applying actions", async () => {
  const repo = new JsonWorkspaceRepository();
  await repo.initialize();
  const connections = new AgentConnectionStore(
    new SettingsStore({
      apiKey: "fixture",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/test-nemotron",
    }),
  );
  const scripted = scriptedModel(),
    dueAt = Date.now() + 3600000;
  const fetcher = (async (url, init) => {
    const response = await scripted(url, init),
      body = await response.json();
    const call = body.choices[0].message.tool_calls?.[0];
    if (call?.function.name === "propose_actions") {
      const args = JSON.parse(call.function.arguments);
      args.actions.push({
        kind: "schedule_review",
        title: "Basis recall",
        prompt: "Review the basis definition with cited evidence",
        dueAt,
        evidenceIds: [1, 2],
      });
      call.function.arguments = JSON.stringify(args);
    }
    return Response.json(body);
  }) as typeof fetch;
  const service = new WorkspaceService(repo, connections),
    worker = new WorkspaceWorker(service, fetcher);
  await service.snapshot(snapshot);
  await service.queue({
    notebookId: "fixture",
    workflow: "study_revision",
    prompt: "Prepare a review session",
    ...selected(await repo.read("fixture")),
  });
  await worker.tick();
  let state = await repo.read("fixture"),
    p = state.proposals[0];
  assert.equal(state.runs[0].status, "completed", state.runs[0].error);
  const review = p.actions.find((a) => a.kind === "schedule_review")!;
  await service.approve({
    notebookId: "fixture",
    id: p.id,
    revision: 1,
    actionIds: [review.id],
    idempotencyKey: "review-once",
    confirm: true,
  });
  const restarted = new WorkspaceWorker(service, scriptedModel());
  await restarted.recover();
  await restarted.tick(dueAt + 1);
  await restarted.tick(dueAt + 2);
  state = await repo.read("fixture");
  assert.equal(state.runs.length, 2);
  assert.equal(state.reviews.length, 1);
  assert.equal(state.reviews[0].status, "completed");
  assert.equal(state.materials.length, 0);
  assert.equal(state.proposals.filter((p) => p.status === "pending").length, 1);
});
test("explicit legacy import preserves stable approved source and note IDs without inventing quiz history or replaying tasks", () => {
  const raw = {
    version: 1,
    sources: [
      { id: "doc", notebookId: "old", name: "Book", pages: ["Page text"] },
      {
        id: "notes:old",
        notebookId: "old",
        kind: "notes",
        name: "My notes",
        pages: ["Known notes"],
      },
    ],
    tasks: [{ prompt: "Do not replay" }],
    memories: [{ kind: "progress", text: "I made mistakes" }],
  };
  const imported = legacySnapshots(raw);
  assert.deepEqual(imported, legacySnapshots(structuredClone(raw)));
  assert.equal(imported[0].sources[0].id, "doc");
  assert.equal(imported[0].notes[0].id, "notes:old");
  assert.equal(imported[0].notes[0].savedAt, undefined);
  assert.ok(!("attempts" in imported[0]));
  assert.equal(raw.tasks.length, 1);
});
