import test from "node:test";
import assert from "node:assert/strict";
import { JsonWorkspaceRepository } from "../server/workspace/repository.ts";
import { WorkspaceService } from "../server/workspace/service.ts";
import { WorkspaceWorker } from "../server/workspace/worker.ts";
import { validateWorkflowReport } from "../server/workspace/evidence.ts";
import { AgentConnectionStore } from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import { snapshot, scriptedModel } from "./fixtures/evidence-workspace.ts";

async function setup() {
  const repo = new JsonWorkspaceRepository();
  await repo.initialize();
  const connections = new AgentConnectionStore(
      new SettingsStore({
        apiKey: "fixture-key",
        baseUrl: "https://api.tokenfactory.nebius.com/v1",
        model: "nvidia/test-nemotron",
      }),
    ),
    service = new WorkspaceService(repo, connections),
    worker = new WorkspaceWorker(service, scriptedModel());
  await service.snapshot(snapshot);
  return { repo, service, worker };
}

test("study reports distinguish unshared quiz history from an empty recorded history", async () => {
  const { repo, service, worker } = await setup();
  const state = await repo.read("fixture");
  const make = async (includeProgress: boolean) => {
    await service.queue({
      notebookId: "fixture",
      workflow: "study_revision",
      prompt: "Build revision guidance from the selected notes.",
      sourceIds: ["book"],
      noteIds: ["basis", "rank"],
      includeProgress,
    });
    await worker.tick();
    return repo.read("fixture");
  };
  const shared = await make(true),
    withoutRecords = shared.proposals[0].report;
  assert.equal(shared.runs[0].status, "completed", shared.runs[0].error);
  assert.equal(withoutRecords?.kind, "study_revision");
  if (withoutRecords?.kind === "study_revision") {
    assert.equal(withoutRecords.progressStatus, "no_recorded_attempts");
    assert.deepEqual(withoutRecords.progressEvidenceIds, [3]);
  }
  const notShared = await make(false),
    report = notShared.proposals[0].report;
  assert.equal(notShared.runs[0].status, "completed", notShared.runs[0].error);
  assert.equal(report?.kind, "study_revision");
  if (report?.kind === "study_revision") {
    assert.equal(report.progressStatus, "not_shared");
    assert.deepEqual(report.progressEvidenceIds, []);
    assert.ok(report.focusAreas.every((area) => area.attemptIds.length === 0));
  }
  await repo.close();
});

test("research needs two sources and its evidence table is tied to both selected papers", async () => {
  const { repo, service, worker } = await setup();
  await assert.rejects(
    service.queue({
      notebookId: "fixture",
      workflow: "research_synthesis",
      prompt: "Compare the selected papers.",
      sourceIds: ["paper-a"],
      noteIds: ["opt-a"],
    }),
    /at least two selected papers/,
  );
  await assert.rejects(
    service.queue({
      notebookId: "fixture",
      workflow: "study_revision",
      prompt: "Plan revision.",
      sourceIds: ["book"],
      noteIds: [],
    }),
    /at least one approved note/,
  );
  await service.queue({
    notebookId: "fixture",
    workflow: "research_synthesis",
    prompt: "Compare retrieval practice across these studies.",
    sourceIds: ["paper-a", "paper-b"],
    noteIds: ["opt-a", "opt-b"],
  });
  await worker.tick();
  const state = await repo.read("fixture"),
    run = state.runs[0],
    report = state.proposals[0].report;
  assert.equal(run.status, "completed", run.error);
  assert.equal(report?.kind, "research_synthesis");
  assert.deepEqual(
    report?.kind === "research_synthesis"
      ? report.papers.map((paper) => paper.sourceId).sort()
      : [],
    ["paper-a", "paper-b"],
  );
  if (report?.kind !== "research_synthesis")
    throw new Error("The research report was not saved.");
  assert.ok(
    report.comparisons.some((comparison) => {
      const sourceIds = comparison.citationIds.map(
        (id) => run.citations.find((citation) => citation.id === id)?.sourceId,
      );
      return new Set(sourceIds).size >= 2;
    }),
  );
  assert.throws(
    () =>
      validateWorkflowReport(
        {
          ...report,
          comparisons: [
            {
              ...report.comparisons[0],
              relation: "conflicts",
              citationIds: [report.papers[0].citationIds[0]],
            },
          ],
        },
        run,
      ),
    /at least two selected papers/,
  );
  assert.throws(
    () =>
      validateWorkflowReport(
        {
          ...report,
          papers: report.papers.map((paper, index) =>
            index === 0
              ? { ...paper, citationIds: report.papers[1].citationIds }
              : paper,
          ),
        },
        run,
      ),
    /can cite only that selected paper/,
  );
  await repo.close();
});
