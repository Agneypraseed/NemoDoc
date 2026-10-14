import test from "node:test";
import assert from "node:assert/strict";
import { snapshot, attempt, fixedDate } from "./fixtures/evidence-workspace.ts";
import { evaluationCases } from "./fixtures/evidence-cases.ts";
import { JsonWorkspaceRepository } from "../server/workspace/repository.ts";
import { WorkspaceService } from "../server/workspace/service.ts";
import { AgentConnectionStore } from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
test("versioned evaluation set has exactly 16 study, 16 research and 8 boundary cases with original provenance", () => {
  assert.equal(new Set(evaluationCases.map((c) => c.id)).size, 40);
  for (const [kind, count] of [
    ["study", 16],
    ["research", 16],
    ["security", 8],
  ] as const)
    assert.equal(
      evaluationCases.filter((c) => c.category === kind).length,
      count,
    );
  for (const c of evaluationCases) {
    assert.ok(c.rubric);
    for (const id of c.sourceIds)
      assert.ok(snapshot.sources.some((s) => s.id === id));
    for (const id of c.noteIds)
      assert.ok(snapshot.notes.some((n) => n.id === id));
  }
});
test("fixture ground truth: recorded score, missing history, known dates and research limitations are reproducible", async () => {
  const repo = new JsonWorkspaceRepository();
  await repo.initialize();
  const service = new WorkspaceService(
    repo,
    new AgentConnectionStore(
      new SettingsStore({
        apiKey: "",
        baseUrl: "http://localhost:8000/v1",
        model: "nvidia/test-nemotron",
      }),
    ),
  );
  await service.snapshot(snapshot);
  const scope = { sourceIds: ["book"], noteIds: ["basis", "rank"] };
  assert.deepEqual(await repo.queryProgress("fixture", scope), []);
  await service.recordAttempt(attempt);
  const progress = await repo.queryProgress("fixture", scope);
  assert.equal(
    (100 * (Number(progress[0].answered) - Number(progress[0].mistakes))) /
      Number(progress[0].answered),
    50,
  );
  const dated = await repo.queryNotes("fixture", scope, {
    since: fixedDate - 86400000,
    limit: 20,
  });
  assert.deepEqual(
    dated.map((n) => n.id),
    ["basis"],
  );
  const papers = snapshot.sources.filter((s) => s.id.startsWith("paper"));
  assert.match(papers[0].pages[0], /0.02 after 40/);
  assert.match(papers[1].pages[0], /0.07 after 100/);
  assert.match(papers[1].pages[0], /No wall-clock/);
});
