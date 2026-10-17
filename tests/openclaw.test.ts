import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.ts";
import {
  AgentConnectionStore,
  connectionInput,
} from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import type { WorkspaceService } from "../server/workspace/service.ts";
import type { WorkspaceWorker } from "../server/workspace/worker.ts";
import {
  snapshot,
  selected,
  scriptedModel,
} from "./fixtures/evidence-workspace.ts";

const config = {
  apiKey: "notebook-secret",
  baseUrl: "https://api.tokenfactory.nebius.com/v1",
  model: "nvidia/test-nemotron",
};
const target = {
  section: "model",
  mode: "openclaw",
  model: "openclaw/nemodoc",
  apiKey: "gateway-secret",
};
const tool = (name: string, args: unknown) => ({
  content: null,
  tool_calls: [
    {
      id: "call-" + name,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});
async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
}

// This is a real loopback HTTP contract fixture, not OpenClaw/OpenShell.
async function harness() {
  const requests: { body: any; headers: any; url: string }[] = [],
    sent: any[] = [];
  const behavior = { probe: "ok", workflow: "ok" };
  const scripted = scriptedModel();
  const gateway = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push({ body, headers: req.headers, url: req.url! });
      assert.equal(req.headers.authorization, "Bearer gateway-secret");
      assert.equal(req.url, "/v1/chat/completions");
      assert.equal(body.model, "openclaw/nemodoc");
      assert.equal(body.user, undefined);
      assert.equal(req.headers["x-openclaw-session-key"], undefined);
      assert.equal(req.headers["x-openclaw-model"], undefined);
      assert.doesNotMatch(
        JSON.stringify(body),
        /notebook-secret|smtp-secret|gateway-secret/,
      );
      let message: any;
      if (body.tools[0]?.function.name === "connection_probe") {
        assert.deepEqual(body.tool_choice, {
          type: "function",
          function: { name: "connection_probe" },
        });
        message =
          behavior.probe === "text"
            ? { content: "Connected" }
            : tool("connection_probe", { ok: true });
      } else if (body.messages[0].content.includes("connection_probe")) {
        assert.equal(body.tool_choice, "none");
        assert.deepEqual(body.tools, []);
        const assistant = body.messages.at(-2),
          result = body.messages.at(-1);
        assert.equal(assistant.role, "assistant");
        assert.equal(result.role, "tool");
        assert.equal(result.tool_call_id, assistant.tool_calls[0].id);
        const receipt = JSON.parse(result.content).receipt;
        message = {
          content: behavior.probe === "no-result" ? "ignored result" : receipt,
        };
      } else if (behavior.workflow === "unapproved-tool") {
        message = tool("send_email", {
          recipient: "attacker@example.com",
          text: "leak",
        });
      } else {
        const response = await scripted("http://fixture", {
          body: JSON.stringify(body),
        });
        message = (await response.json()).choices[0].message;
        const proposal = message.tool_calls?.find(
          (c: any) => c.function.name === "propose_actions",
        );
        if (proposal) {
          const args = JSON.parse(proposal.function.arguments);
          args.actions.push({
            kind: "send_email",
            title: "Reviewed revision",
            text: "Basis practice. [2]",
            evidenceIds: [1, 2],
          });
          proposal.function.arguments = JSON.stringify(args);
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message }] }));
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  const gatewayUrl = await listen(gateway);
  const app = createApp(config, fetch, {
    smtpTransportFactory: () => ({
      verify: async () => true,
      sendMail: async (message) => {
        sent.push(message);
        return {
          messageId: "fixture-email",
          accepted: [message.to],
          rejected: [],
        };
      },
      close() {},
    }),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (url: string, body?: unknown) => {
    const response = await fetch(base + url, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  await app.locals.workspace.ready;
  const service: WorkspaceService = app.locals.workspace.service;
  const worker: WorkspaceWorker = app.locals.workspace.worker;
  await api("/api/agent/connections", {
    ...target,
    baseUrl: gatewayUrl + "/v1",
  });
  await api("/api/agent/connections", {
    section: "email",
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    smtpSecurity: "starttls",
    smtpUser: "sender@example.com",
    from: "sender@example.com",
    recipient: "owner@example.com",
    password: "smtp-secret",
  });
  await service.snapshot(snapshot);
  const selection = selected(await service.repository.read("fixture"));
  const queue = () =>
    service.queue({
      notebookId: "fixture",
      workflow: "study_revision",
      prompt:
        "Prepare a short cited revision summary and propose an email to me",
      ...selection,
      sourceIds: ["book"],
      noteIds: ["basis"],
    });
  return {
    api,
    service,
    worker,
    queue,
    requests,
    sent,
    behavior,
    gatewayUrl,
    connections: app.locals.agent.connections as AgentConnectionStore,
    close: async () => {
      app.locals.agent.stop();
      worker.stop();
      await close(server);
      await close(gateway);
      await service.repository.close();
    },
  };
}

test("OpenClaw HTTP routing and two-way tools preserve evidence proposals and approval before SMTP", async () => {
  const h = await harness();
  try {
    await assert.rejects(h.queue(), /Test the agent connection/);
    assert.equal((await h.api("/api/agent/connections/test", {})).status, 200);
    assert.equal(h.requests.length, 2);
    assert.doesNotMatch(JSON.stringify(h.requests), /A basis|Linear spaces/);
    const publicConfig = (await h.api("/api/agent/connections")).data;
    assert.equal(publicConfig.model.tested, true);
    assert.equal(publicConfig.model.hasApiKey, true);
    assert.doesNotMatch(
      JSON.stringify(publicConfig),
      /gateway-secret|smtp-secret/,
    );
    await h.queue();
    await h.worker.tick();
    let state = await h.service.repository.read("fixture");
    assert.equal(
      state.runs[0].status,
      "completed",
      JSON.stringify({
        error: state.runs[0].error,
        steps: state.runs[0].steps,
      }),
    );
    assert.equal(state.runs[0].connection.mode, "openclaw");
    assert.equal(state.runs[0].connection.model, "openclaw/nemodoc");
    assert.ok(state.runs[0].evidence.length);
    assert.doesNotMatch(
      JSON.stringify(h.requests.map((r) => r.body)),
      /Ritchie|Okano|Rank-nullity|paper-a|paper-b/,
    );
    assert.equal(state.proposals.length, 1);
    assert.equal(state.materials.length, 0);
    assert.equal(state.outbox.length, 0);
    assert.equal(h.sent.length, 0);
    const proposal = state.proposals[0];
    await h.service.approve({
      notebookId: "fixture",
      id: proposal.id,
      revision: proposal.revision,
      actionIds: proposal.actions.map((a) => a.id),
      idempotencyKey: "openclaw-approved",
      confirm: true,
    });
    assert.equal(h.sent.length, 0);
    await h.worker.dispatch("fixture");
    await h.worker.dispatch("fixture");
    state = await h.service.repository.read("fixture");
    assert.equal(state.outbox[0].status, "accepted");
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].to, "owner@example.com");
    assert.match(h.sent[0].text, /Basis practice/);
    assert.equal((await h.api("/api/settings")).data.model, config.model);
  } finally {
    await h.close();
  }
});

for (const failure of ["text", "no-result"])
  test(`OpenClaw ${failure} probe cannot enable workflow runs`, async () => {
    const h = await harness();
    try {
      h.behavior.probe = failure;
      assert.equal(
        (await h.api("/api/agent/connections/test", {})).status,
        502,
      );
      assert.equal(h.connections.value.model.tested, false);
      await assert.rejects(h.queue(), /Test the agent connection/);
      assert.equal(h.sent.length, 0);
    } finally {
      await h.close();
    }
  });

test("OpenClaw cannot execute an unapproved native messaging tool through NemoDoc", async () => {
  const h = await harness();
  try {
    assert.equal((await h.api("/api/agent/connections/test", {})).status, 200);
    h.behavior.workflow = "unapproved-tool";
    await h.queue();
    await h.worker.tick();
    const state = await h.service.repository.read("fixture");
    assert.equal(state.runs[0].status, "failed");
    assert.equal(state.proposals.length, 0);
    assert.equal(state.outbox.length, 0);
    assert.equal(h.sent.length, 0);
  } finally {
    await h.close();
  }
});

test("OpenClaw requires its gateway token; mode/origin changes clear it and queued runs reject changed revisions", async () => {
  const h = await harness();
  try {
    assert.equal((await h.api("/api/agent/connections/test", {})).status, 200);
    await h.queue();
    await h.api("/api/agent/connections", {
      ...target,
      apiKey: undefined,
      clearApiKey: true,
      baseUrl: h.gatewayUrl + "/v1",
    });
    assert.equal((await h.api("/api/agent/connections/test", {})).status, 502);
    assert.equal(h.requests.length, 2);
    await h.worker.tick();
    assert.equal(
      (await h.service.repository.read("fixture")).runs[0].status,
      "failed",
    );
    assert.equal(h.sent.length, 0);
    const save = (value: unknown) =>
      h.connections.save(connectionInput.parse(value));
    save({ ...target, baseUrl: h.gatewayUrl + "/v1" });
    save({
      ...target,
      mode: "custom",
      apiKey: undefined,
      baseUrl: h.gatewayUrl + "/v1",
    });
    assert.equal(h.connections.value.model.apiKey, "");
    save({ ...target, baseUrl: h.gatewayUrl + "/v1" });
    save({
      ...target,
      apiKey: undefined,
      baseUrl: "https://another.example.com/v1",
    });
    assert.equal(h.connections.value.model.apiKey, "");
    assert.throws(() =>
      connectionInput.parse({
        ...target,
        model: "nvidia/nemotron",
        baseUrl: h.gatewayUrl + "/v1",
      }),
    );
    assert.throws(() =>
      connectionInput.parse({
        ...target,
        baseUrl: "http://remote.example.com/v1",
      }),
    );
  } finally {
    await h.close();
  }
});

test("OpenClaw gateway redirects never forward the token to another endpoint", async () => {
  let forwarded = 0;
  const destination = createServer((_req, res) => {
    forwarded++;
    res.end("unexpected");
  });
  const destinationUrl = await listen(destination);
  const redirector = createServer((_req, res) => {
    res.writeHead(307, { Location: destinationUrl });
    res.end();
  });
  const redirectUrl = await listen(redirector);
  try {
    const connections = new AgentConnectionStore(new SettingsStore(config));
    connections.save(
      connectionInput.parse({ ...target, baseUrl: redirectUrl + "/v1" }),
    );
    await assert.rejects(
      connections.modelJSON(fetch, { model: target.model, messages: [] }),
    );
    assert.equal(forwarded, 0);
  } finally {
    await close(redirector);
    await close(destination);
  }
});
