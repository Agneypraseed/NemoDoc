import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { JsonWorkspaceRepository } from "../server/workspace/repository.ts";
import { WorkspaceService } from "../server/workspace/service.ts";
import { WorkspaceWorker } from "../server/workspace/worker.ts";
import { SettingsStore } from "../server/settings.ts";
import { AgentConnectionStore } from "../server/agent-connections.ts";
import {
  snapshot,
  attempt,
  selected,
  scriptedModel,
  fixedDate,
} from "./fixtures/evidence-workspace.ts";

for (const finishAt of [8, 12])
  test(`valid proposal on call ${finishAt} completes without an extra model call or applied actions`, async () => {
    const { repo, service } = await workspaceSetup();
    let calls = 0;
    const scripted = scriptedModel();
    const fetcher: typeof fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body));
      calls++;
      if (calls >= 3 && calls < finishAt)
        return Response.json({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: `read-${calls}`,
                    type: "function",
                    function: { name: "query_review_tasks", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        });
      if (calls === finishAt) {
        assert.deepEqual(
          body.tools.map((t: any) => t.function.name),
          ["propose_actions"],
        );
        assert.equal(body.tool_choice.function.name, "propose_actions");
        const toolMessages = body.messages.filter(
          (m: any) => m.role === "tool",
        );
        body.messages = [
          ...body.messages.filter((m: any) => m.role !== "tool"),
          ...toolMessages.slice(0, 2),
        ];
        return scripted(url, { ...init, body: JSON.stringify(body) });
      }
      return scripted(url, init);
    };
    await service.queue({
      notebookId: "fixture",
      workflow: "study_revision",
      prompt: "Prepare a cited proposal",
      ...selected(await repo.read("fixture")),
    });
    await new WorkspaceWorker(service, fetcher).tick();
    const state = await repo.read("fixture");
    assert.equal(state.runs[0].status, "completed", state.runs[0].error);
    assert.equal(calls, finishAt);
    assert.match(state.runs[0].answer, /Review 2 proposed actions/);
    assert.match(state.runs[0].answer, /Nothing has been applied or sent/);
    assert.equal(state.proposals.length, 1);
    assert.equal(state.materials.length, 0);
    await repo.close();
  });

export async function workspaceSetup(repo = new JsonWorkspaceRepository()) {
  await repo.initialize();
  const connections = new AgentConnectionStore(
    new SettingsStore({
      apiKey: "fixture-key",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/test-nemotron",
    }),
  );
  const service = new WorkspaceService(repo, connections),
    worker = new WorkspaceWorker(service, scriptedModel());
  await service.snapshot(snapshot);
  return { repo, connections, service, worker };
}
test("a provider response after a suspended-machine deadline cannot execute tools", async (t) => {
  const { repo, service } = await workspaceSetup();
  await service.queue({
    notebookId: "fixture",
    workflow: "study_revision",
    prompt: "Prepare cited work",
    ...selected(await repo.read("fixture")),
  });
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const scripted = scriptedModel();
  const fetcher: typeof fetch = async (url, init) => {
    now += 181000;
    return scripted(url, init);
  };
  await new WorkspaceWorker(service, fetcher).tick();
  const state = await repo.read("fixture");
  assert.equal(state.runs[0].status, "failed");
  assert.match(state.runs[0].error!, /timed out/);
  assert.equal(state.runs[0].steps.length, 0);
  assert.equal(state.proposals.length, 0);
  await repo.close();
});
for (const workflow of ["study_revision", "research_synthesis"] as const)
  test(`${workflow}: read → propose → edit → approve is transactional and idempotent`, async () => {
    const { repo, service, worker } = await workspaceSetup();
    await service.recordAttempt(attempt);
    await service.recordAttempt(attempt);
    const state = await repo.read("fixture");
    await service.queue({
      notebookId: "fixture",
      workflow,
      prompt: "Prepare cited materials for review",
      ...selected(state),
      includeProgress: true,
    });
    await worker.tick();
    const pending = await repo.read("fixture");
    assert.equal(pending.runs[0].status, "completed", pending.runs[0].error);
    assert.equal(pending.materials.length, 0);
    assert.equal(pending.plan, "");
    const p = pending.proposals[0];
    const actions = p.actions.map(({ id, ...action }) => ({
      id,
      action:
        action.kind === "update_plan"
          ? { ...action, text: "Edited plan. [2]" }
          : action,
    }));
    await service.edit({
      notebookId: "fixture",
      id: p.id,
      revision: 1,
      actions,
    });
    await assert.rejects(
      service.approve({
        notebookId: "fixture",
        id: p.id,
        revision: 1,
        actionIds: [p.actions[0].id],
        idempotencyKey: "stale",
        confirm: true,
      }),
    );
    const approval = {
      notebookId: "fixture",
      id: p.id,
      revision: 2,
      actionIds: [p.actions[0].id],
      idempotencyKey: "once",
      confirm: true,
    };
    const receipts = await Promise.all([
      service.approve(approval),
      service.approve(approval),
    ]);
    assert.deepEqual(receipts[0], receipts[1]);
    const applied = await repo.read("fixture");
    assert.equal(applied.materials.length, 1);
    assert.equal(applied.materials[0].id, p.actions[0].id);
    assert.equal(applied.plan, "");
    assert.equal(applied.receipts.length, 1);
    assert.equal(applied.materials[0].citations.length, 1);
    await repo.close();
  });
test("note filters, unknown dates, scoped SQL-equivalent aggregation and immutable quiz snapshots", async () => {
  const { repo, service } = await workspaceSetup();
  await service.recordAttempt(attempt);
  const state = await repo.read("fixture"),
    scope = selected(state);
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
        tag: "optimization",
        limit: 20,
      })
    ).length,
    2,
  );
  const progress = await repo.queryProgress("fixture", scope);
  assert.equal(progress[0].answered, 2);
  assert.equal(progress[0].mistakes, 1);
  assert.deepEqual(progress[0].attemptIds, [attempt.id]);
  await assert.rejects(
    service.recordAttempt({
      ...attempt,
      answers: attempt.answers.map((a) => ({ ...a, selected: 1 })),
    }),
  );
  const before = (await repo.read("fixture")).revision;
  await service.snapshot(snapshot);
  assert.equal((await repo.read("fixture")).revision, before);
  assert.deepEqual(await repo.queryNotes("other", scope, { limit: 20 }), []);
});
test("stale evidence, provider edits, rejection and notebook boundaries block actions", async () => {
  const { repo, service, worker, connections } = await workspaceSetup();
  const state = await repo.read("fixture");
  await assert.rejects(
    service.queue({
      notebookId: "other",
      workflow: "study_revision",
      prompt: "Get notes",
      ...selected(state),
    }),
  );
  await assert.rejects(
    service.queue({
      notebookId: "fixture",
      workflow: "study_revision",
      prompt: "Get notes",
      sourceIds: ["foreign"],
      noteIds: [],
    }),
  );
  await service.queue({
    notebookId: "fixture",
    workflow: "study_revision",
    prompt: "Get notes",
    ...selected(state),
  });
  await worker.tick();
  let p = (await repo.read("fixture")).proposals[0];
  connections.value.model.mode = "custom";
  await assert.rejects(
    service.approve({
      notebookId: "fixture",
      id: p.id,
      revision: 1,
      actionIds: [p.actions[0].id],
      idempotencyKey: "provider",
      confirm: true,
    }),
  );
  connections.value.model.mode = "notebook";
  await service.reject({ notebookId: "fixture", id: p.id, revision: 1 });
  await assert.rejects(
    service.approve({
      notebookId: "fixture",
      id: p.id,
      revision: 1,
      actionIds: [p.actions[0].id],
      idempotencyKey: "rejected",
      confirm: true,
    }),
  );
  await service.queue({
    notebookId: "fixture",
    workflow: "study_revision",
    prompt: "Again",
    ...selected(state),
  });
  await worker.tick();
  p = (await repo.read("fixture")).proposals[0];
  await service.revoke("fixture");
  assert.equal(
    (await repo.read("fixture")).proposals.find((v) => v.id === p.id)?.status,
    "stale",
  );
  assert.equal((await repo.read("fixture")).materials.length, 0);
});
test("JSON atomic rollback, persistence, restart recovery and uncertain email never auto-retry", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "workspace-"));
  try {
    const filename = path.join(dir, "workspace.json");
    const { repo, service } = await workspaceSetup(
      new JsonWorkspaceRepository(filename),
    );
    await assert.rejects(
      repo.transaction("fixture", (s) => {
        s.plan = "partial";
        throw new Error("rollback");
      }),
    );
    assert.equal((await repo.read("fixture")).plan, "");
    const run = await service.queue({
      notebookId: "fixture",
      workflow: "study_revision",
      prompt: "Get notes",
      ...selected(await repo.read("fixture")),
    });
    await repo.transaction("fixture", (s) => {
      s.runs[0].status = "running";
      s.outbox.push({
        id: "email",
        proposalId: "proposal",
        actionId: "email",
        target: {
          channel: "email",
          recipient: "test@example.com",
          revision: "one",
        },
        title: "Test",
        text: "Test",
        status: "sending",
        createdAt: fixedDate,
      });
    });
    const next = await workspaceSetup(new JsonWorkspaceRepository(filename));
    await next.worker.recover();
    await next.worker.dispatch("fixture");
    const recovered = await next.repo.read("fixture");
    assert.equal(
      recovered.runs.find((r) => r.id === run.id)?.status,
      "interrupted",
    );
    assert.equal(recovered.outbox[0].status, "unknown");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
