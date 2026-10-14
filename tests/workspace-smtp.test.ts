import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { generate } from "selfsigned";
import { SMTPServer } from "smtp-server";
import { JsonWorkspaceRepository } from "../server/workspace/repository.ts";
import { WorkspaceService } from "../server/workspace/service.ts";
import { WorkspaceWorker } from "../server/workspace/worker.ts";
import {
  AgentConnectionStore,
  connectionInput,
} from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import { createSmtpTransport } from "../server/smtp.ts";
import {
  snapshot,
  selected,
  scriptedModel,
} from "./fixtures/evidence-workspace.ts";
test("approved outbox submits exact reviewed email through local TLS SMTP once, recipient changes rollback all actions", async () => {
  const cert = await generate([{ name: "commonName", value: "localhost" }], {
    extensions: [
      { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }] },
    ],
  });
  const messages: string[] = [];
  const smtp = new SMTPServer({
    secure: true,
    key: cert.private,
    cert: cert.cert,
    closeTimeout: 1000,
    onAuth: (_a, _s, cb) => cb(null, { user: "fixture" }),
    onData: (stream, _s, cb) => {
      const chunks: Buffer[] = [];
      stream.on("data", (d) => chunks.push(Buffer.from(d)));
      stream.on("end", () => {
        messages.push(Buffer.concat(chunks).toString());
        cb();
      });
    },
  });
  await new Promise<void>((r) => smtp.listen(0, "127.0.0.1", r));
  const repo = new JsonWorkspaceRepository();
  await repo.initialize();
  const connections = new AgentConnectionStore(
    new SettingsStore({
      apiKey: "fixture",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/test-nemotron",
    }),
    undefined,
    (options) =>
      createSmtpTransport({
        ...options,
        tls: { ...options.tls, ca: cert.cert, servername: "localhost" },
      }),
  );
  connections.save(
    connectionInput.parse({
      section: "email",
      smtpHost: "127.0.0.1",
      smtpPort: (smtp.server.address() as AddressInfo).port,
      smtpSecurity: "tls",
      smtpUser: "fixture@example.com",
      from: "fixture@example.com",
      recipient: "owner@example.com",
      password: "fixture-password",
    }),
  );
  const scripted = scriptedModel();
  const fetcher = (async (url, init) => {
    const response = await scripted(url, init),
      body = await response.json();
    const call = body.choices[0].message.tool_calls?.[0];
    if (call?.function.name === "propose_actions") {
      const args = JSON.parse(call.function.arguments);
      args.actions.push({
        kind: "send_email",
        title: "Reviewed revision",
        text: "Basis practice. [2]",
        evidenceIds: [1, 2],
      });
      call.function.arguments = JSON.stringify(args);
    }
    return Response.json(body);
  }) as typeof fetch;
  const service = new WorkspaceService(repo, connections),
    worker = new WorkspaceWorker(service, fetcher);
  try {
    await service.snapshot(snapshot);
    await service.queue({
      notebookId: "fixture",
      workflow: "study_revision",
      prompt: "Prepare revision and email me a preview for approval",
      ...selected(await repo.read("fixture")),
    });
    await worker.tick();
    let state = await repo.read("fixture");
    assert.equal(state.runs[0].status, "completed", state.runs[0].error);
    assert.equal(messages.length, 0);
    assert.equal(state.outbox.length, 0);
    const p = state.proposals[0],
      email = p.actions.find((a) => a.kind === "send_email")!;
    assert.equal(email.kind, "send_email");
    const approval = {
      notebookId: "fixture",
      id: p.id,
      revision: 1,
      actionIds: p.actions.map((a) => a.id),
      idempotencyKey: "smtp-once",
      confirm: true,
    };
    const old = connections.value.email.revision;
    connections.value.email.revision = "changed";
    await assert.rejects(service.approve(approval));
    assert.equal((await repo.read("fixture")).materials.length, 0);
    connections.value.email.revision = old;
    await service.approve(approval);
    assert.equal(messages.length, 0);
    await worker.dispatch("fixture");
    await service.approve(approval);
    await worker.dispatch("fixture");
    state = await repo.read("fixture");
    assert.equal(messages.length, 1);
    assert.equal(state.outbox[0].status, "accepted");
    assert.match(messages[0], /To: owner@example.com/);
    assert.match(messages[0], /Basis practice/);
    assert.match(messages[0], /Original linear spaces/);
    assert.doesNotMatch(messages[0], /fixture-password/);
  } finally {
    await new Promise<void>((r) => smtp.close(r));
    await repo.close();
  }
});
