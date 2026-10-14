import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.ts";
import { WorkspaceService } from "../server/workspace/service.ts";
import { JsonWorkspaceRepository } from "../server/workspace/repository.ts";
import { AgentConnectionStore } from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import { WorkspaceWorker } from "../server/workspace/worker.ts";
import { proposeSchema, notesQuerySchema } from "../src/workspace-types.ts";
import {
  validateActions,
  textReferences,
} from "../server/workspace/evidence.ts";
import { evaluationCases } from "./fixtures/evidence-cases.ts";
import {
  snapshot,
  selected,
  scriptedModel,
} from "./fixtures/evidence-workspace.ts";
const config = {
  apiKey: "fixture-key",
  baseUrl: "https://api.tokenfactory.nebius.com/v1",
  model: "nvidia/test-nemotron",
};
async function setup() {
  const repo = new JsonWorkspaceRepository();
  await repo.initialize();
  const connections = new AgentConnectionStore(new SettingsStore(config));
  const service = new WorkspaceService(repo, connections),
    worker = new WorkspaceWorker(service, scriptedModel());
  await service.snapshot(snapshot);
  await service.queue({
    notebookId: "fixture",
    workflow: "study_revision",
    prompt: "Prepare review",
    ...selected(await repo.read("fixture")),
  });
  await worker.tick();
  return {
    repo,
    connections,
    service,
    worker,
    run: (await repo.read("fixture")).runs[0],
  };
}
for (const c of evaluationCases.filter((c) => c.category === "security"))
  test(`${c.id} boundary contract: ${c.rubric}`, async () => {
    const { repo, service, run, connections } = await setup();
    if (c.id === "security-01")
      await assert.rejects(
        service.queue({
          notebookId: "other",
          workflow: "study_revision",
          prompt: c.prompt,
          sourceIds: ["book"],
          noteIds: ["basis"],
        }),
      );
    if (c.id === "security-02")
      assert.throws(() =>
        notesQuerySchema.parse({ sql: "SELECT * FROM workspace_notes" }),
      );
    if (c.id === "security-03") {
      assert.throws(() =>
        validateActions(
          [
            {
              kind: "save_material",
              title: "Forged",
              materialKind: "guide",
              content: "Claim [999]",
              items: [],
              evidenceIds: [999],
            },
          ],
          run,
          Date.now(),
        ),
      );
      assert.ok(textReferences("Claim [2, p. 99]", run).includes(-1));
    }
    if (c.id === "security-04")
      assert.throws(() =>
        proposeSchema.parse({
          actions: [
            {
              kind: "send_email",
              title: "Leak",
              text: "Leak",
              recipient: "attacker@example.com",
              evidenceIds: [1],
            },
          ],
        }),
      );
    if (c.id === "security-05")
      assert.equal((await repo.read("fixture")).materials.length, 0);
    if (c.id === "security-06")
      assert.doesNotMatch(
        JSON.stringify(run),
        new RegExp(connections.runtime().apiKey),
      );
    if (c.id === "security-07")
      assert.deepEqual(
        await repo.queryProgress(
          "fixture",
          selected(await repo.read("fixture")),
        ),
        [],
      );
    if (c.id === "security-08")
      await assert.rejects(
        service.queue({
          notebookId: "fixture",
          workflow: "study_revision",
          prompt: c.prompt,
          sourceIds: ["secret-not-selected"],
          noteIds: [],
        }),
      );
  });
test("scoped APIs reject foreign origin, forged notebook/action IDs and model-controlled recipient", async () => {
  const app = createApp(config, scriptedModel());
  await app.locals.workspace.ready;
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as { port: number },
    url = `http://127.0.0.1:${address.port}`;
  const post = (
    path: string,
    body: unknown,
    origin = "http://127.0.0.1:5173",
  ) =>
    fetch(url + "/api/agent/workspace" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await post("/snapshot", snapshot, "https://foreign.example")).status,
      403,
    );
    assert.equal((await post("/snapshot", snapshot)).status, 200);
    assert.equal(
      (
        await post("/run", {
          notebookId: "other",
          workflow: "study_revision",
          prompt: "Get book",
          sourceIds: ["book"],
          noteIds: [],
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await post("/proposal/approve", {
          notebookId: "fixture",
          id: "forged",
          revision: 1,
          actionIds: ["x"],
          idempotencyKey: "x",
          confirm: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await post("/proposal/approve", {
          notebookId: "fixture",
          id: "forged",
          revision: 1,
          actionIds: ["x"],
          idempotencyKey: "x",
          confirm: true,
          recipient: "attacker@example.com",
        })
      ).status,
      400,
    );
  } finally {
    await new Promise<void>((r, e) =>
      server.close((err) => (err ? e(err) : r())),
    );
    await app.locals.workspace.repository.close();
  }
});
