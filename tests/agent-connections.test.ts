import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.ts";
import { AgentStore } from "../server/agent-store.ts";
import {
  AgentConnectionStore,
  connectionInput,
} from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";

const config = {
  apiKey: "notebook-secret",
  baseUrl: "https://api.tokenfactory.nebius.com/v1",
  model: "nvidia/test-nemotron",
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
const reply = (message: unknown) => Response.json({ choices: [{ message }] });
const model = {
  section: "model",
  mode: "custom",
  baseUrl: "http://localhost:11434/v1",
  model: "gemma4:e4b",
};
const email = {
  section: "email",
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpSecurity: "starttls",
  smtpUser: "sender@example.com",
  from: "sender@example.com",
  recipient: "owner@example.com",
  password: "email-secret",
};
const whatsapp = {
  section: "whatsapp",
  phoneNumberId: "123456",
  recipient: "+491234567890",
  apiVersion: "v26.0",
  templateName: "study_summary",
  language: "en_US",
  apiKey: "whatsapp-secret",
};
const task = {
  notebookId: "notebook",
  title: "Notes briefing",
  prompt: "Summarize my notes in one sentence.",
  skillId: "weekly-briefing",
  sourceIds: ["notes:notebook"],
  dueAt: 1,
};
async function harness(fetcher: typeof fetch) {
  const smtpMessages: any[] = [],
    smtpConnections: any[] = [];
  const app = createApp(config, fetcher, {
    smtpTransportFactory: (options) => {
      smtpConnections.push(options);
      return {
        verify: async () => true,
        sendMail: async (message) => {
          smtpMessages.push(message);
          return {
            messageId: "smtp-fixture",
            accepted: [message.to],
            rejected: [],
          };
        },
        close() {},
      };
    },
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
  return {
    app,
    api,
    smtpMessages,
    smtpConnections,
    close: async () => {
      app.locals.agent.stop();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
async function approve(api: Awaited<ReturnType<typeof harness>>["api"]) {
  assert.equal(
    (
      await api("/api/agent/sources", {
        notebookId: "notebook",
        consent: true,
        sources: [
          {
            id: "notes:notebook",
            notebookId: "notebook",
            name: "Notebook notes",
            kind: "notes",
            pages: ["Recall improves with spaced practice."],
          },
        ],
      })
    ).status,
    200,
  );
}

test("Gemma tool test gates tasks; notes alone provide scoped evidence without changing notebook model policy", async () => {
  const requests: any[] = [];
  let probePass = true;
  const h = await harness((async (url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push({ url: String(url), body, headers: init?.headers });
    if (body.tools[0].function.name === "connection_probe")
      return reply(
        probePass
          ? tool("connection_probe", { ok: true })
          : { content: "Connected, but no tool support" },
      );
    if (!body.messages.some((m: any) => m.role === "tool"))
      return reply(tool("search_sources", { query: "recall" }));
    return reply({ content: "Use spaced practice. [1]" });
  }) as typeof fetch);
  try {
    await approve(h.api);
    await h.api("/api/agent/connections", model);
    assert.equal((await h.api("/api/agent/task", task)).status, 409);
    assert.equal((await h.api("/api/agent/connections/test", {})).status, 200);
    assert.equal((await h.api("/api/agent/task", task)).status, 200);
    await h.app.locals.agent.tick(1);
    const state = (await h.api("/api/agent")).data;
    assert.equal(state.runs[0].status, "completed");
    assert.equal(state.runs[0].citations[0].sourceId, "notes:notebook");
    assert.ok(
      requests.every(
        (r) => r.url === "http://localhost:11434/v1/chat/completions",
      ),
    );
    assert.ok(requests.every((r) => !r.headers.Authorization));
    assert.equal((await h.api("/api/settings")).data.model, config.model);
    const settings = (await h.api("/api/settings")).data;
    assert.equal(
      (await h.api("/api/settings", { ...settings, model: "gemma4:e4b" }))
        .status,
      400,
    );
    assert.equal(
      (
        await h.api("/api/agent/sources", {
          notebookId: "other",
          consent: true,
          sources: [
            {
              id: "notes:notebook",
              notebookId: "other",
              name: "Forged",
              kind: "notes",
              pages: ["Private"],
            },
          ],
        })
      ).status,
      409,
    );
    probePass = false;
    assert.equal((await h.api("/api/agent/connections/test", {})).status, 502);
    assert.equal(
      (await h.api("/api/agent/connections")).data.model.tested,
      false,
    );
    assert.equal((await h.api("/api/agent/task", task)).status, 409);
  } finally {
    await h.close();
  }
});

test("OpenClaw tasks use the dedicated agent and scoped note tools after a two-turn gateway test", async () => {
  const requests: any[] = [];
  const h = await harness((async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    assert.equal(body.model, "openclaw/nemodoc");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer gateway-fixture",
    );
    if (body.tools[0]?.function.name === "connection_probe")
      return reply(tool("connection_probe", { ok: true }));
    const result = body.messages.find((m: any) => m.role === "tool");
    if (body.messages[0].content.includes("connection_probe"))
      return reply({ content: JSON.parse(result.content).receipt });
    return reply(
      result
        ? { content: "Use spaced practice. [1]" }
        : tool("search_sources", { query: "recall" }),
    );
  }) as typeof fetch);
  try {
    await approve(h.api);
    await h.api("/api/agent/connections", {
      ...model,
      mode: "openclaw",
      baseUrl: "http://127.0.0.1:18789/v1",
      model: "openclaw/nemodoc",
      apiKey: "gateway-fixture",
    });
    assert.equal((await h.api("/api/agent/task", task)).status, 409);
    assert.equal((await h.api("/api/agent/connections/test", {})).status, 200);
    assert.equal((await h.api("/api/agent/task", task)).status, 200);
    await h.app.locals.agent.tick(1);
    const state = (await h.api("/api/agent")).data;
    assert.equal(state.tasks[0].connectionMode, "openclaw");
    assert.equal(state.runs[0].status, "completed");
    assert.equal(state.runs[0].citations[0].sourceId, "notes:notebook");
    assert.equal(requests.length, 4);
    assert.equal(h.smtpMessages.length, 0);
  } finally {
    await h.close();
  }
});

test("automatic email corrects premature and internal citations before sending to the approved recipient", async () => {
  const sent: { url: string; init?: RequestInit }[] = [];
  const h = await harness((async (url, init) => {
    sent.push({ url: String(url), init });
    const body = JSON.parse(String(init?.body));
    if (!body.messages.some((m: any) => m.role === "tool")) {
      if (!body.messages.some((m: any) => m.role === "assistant"))
        return reply({ content: "Review spaced practice. [1]" });
      assert.match(body.messages.at(-1).content, /Use search_sources/);
      return reply(tool("search_sources", { query: "recall" }));
    }
    if (
      !body.messages.some(
        (m: any) =>
          m.role === "assistant" &&
          m.content === "Review spaced practice. [notes:notebook]",
      )
    )
      return reply({ content: "Review spaced practice. [notes:notebook]" });
    assert.match(body.messages.at(-1).content, /numeric citation IDs/);
    return reply({ content: "Review spaced practice. [1]" });
  }) as typeof fetch);
  try {
    await approve(h.api);
    await h.api("/api/agent/connections", email);
    assert.equal(
      (
        await h.api("/api/agent/task", {
          ...task,
          channels: ["email"],
          channelRevisions: { email: "stale" },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await h.api("/api/agent/task", {
          ...task,
          channels: ["email"],
          channelRevisions: {
            email: h.app.locals.agent.connections.target("email").revision,
          },
        })
      ).status,
      200,
    );
    await h.app.locals.agent.tick(1);
    const run = h.app.locals.agent.data.state.runs[0];
    assert.equal(run.status, "completed");
    assert.equal(run.calls, 4);
    assert.equal(run.citations[0].sourceId, "notes:notebook");
    assert.equal(run.deliveries[0].status, "accepted");
    const delivery = h.smtpMessages[0];
    assert.equal(delivery.text, "Review spaced practice. [1]");
    assert.equal(delivery.from, "sender@example.com");
    assert.equal(delivery.to, "owner@example.com");
    assert.equal(h.smtpConnections[0].host, "smtp.example.com");
    assert.equal(h.smtpConnections[0].auth.pass, "email-secret");
    assert.equal(h.smtpConnections[0].requireTLS, true);
    for (const url of [
      "/api/agent",
      "/api/agent/export",
      "/api/agent/connections",
    ])
      assert.doesNotMatch(
        JSON.stringify((await h.api(url)).data),
        /email-secret|notebook-secret/,
      );
    assert.doesNotMatch(JSON.stringify(sent), /email-secret/);
    const target = h.app.locals.agent.connections.target("email");
    assert.equal(
      (
        await h.api("/api/agent/delivery/send", {
          ...target,
          runId: run.id,
          confirm: true,
        })
      ).status,
      409,
    );
    assert.equal(h.smtpMessages.length, 1);
    await h.api("/api/agent/task", { ...task, channels: ["email"] });
    await h.api("/api/agent/connections", {
      ...email,
      recipient: "changed@example.com",
    });
    const next = h.app.locals.agent.data.state.tasks[1];
    assert.equal(next.status, "paused");
    assert.equal(
      (await h.api("/api/agent/task/action", { id: next.id, action: "run" }))
        .status,
      409,
    );
  } finally {
    await h.close();
  }
});

test("current NVIDIA model reads selected notes and submits weekday summaries by email at 08:00 Berlin", async () => {
  const requests: { url: string; body: any }[] = [];
  const h = await harness((async (url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push({ url: String(url), body });
    assert.equal(body.model, config.model);
    assert.equal(
      (init?.headers as any).Authorization,
      "Bearer notebook-secret",
    );
    if (!body.messages.some((m: any) => m.role === "tool"))
      return reply(tool("search_sources", { query: "recall" }));
    assert.match(
      body.messages.find((m: any) => m.role === "tool").content,
      /Recall improves with spaced practice/,
    );
    return reply({
      content: "Revision summary: use spaced practice to improve recall. [1]",
    });
  }) as typeof fetch);
  try {
    await approve(h.api);
    await h.api("/api/agent/connections", email);
    const connection = (await h.api("/api/agent/connections")).data;
    assert.equal(connection.model.mode, "notebook");
    assert.equal(connection.model.model, config.model);
    const created = await h.api("/api/agent/task", {
      ...task,
      schedule: { kind: "weekdays", time: "08:00", timeZone: "Europe/Berlin" },
      channels: ["email"],
    });
    assert.equal(created.status, 200);
    const stored = h.app.locals.agent.data.state.tasks[0];
    stored.dueAt = Date.parse("2026-10-16T06:00:00Z");
    await h.app.locals.agent.tick(Date.parse("2026-10-17T09:00:00Z"));
    assert.equal(requests.length, 0);
    assert.equal(stored.dueAt, Date.parse("2026-10-19T06:00:00Z"));
    await h.app.locals.agent.tick(Date.parse("2026-10-19T05:59:00Z"));
    assert.equal(requests.length, 0);
    await h.app.locals.agent.tick(Date.parse("2026-10-19T06:00:00Z"));
    assert.equal(stored.status, "active");
    assert.equal(stored.dueAt, Date.parse("2026-10-20T06:00:00Z"));
    assert.equal(
      h.app.locals.agent.data.state.runs[0].deliveries[0].status,
      "accepted",
    );
    const outgoing = h.smtpMessages;
    assert.equal(outgoing.length, 1);
    assert.equal(outgoing[0].to, "owner@example.com");
    assert.match(outgoing[0].text, /Revision summary/);
    await h.app.locals.agent.tick(Date.parse("2026-10-19T06:00:02Z"));
    assert.equal(h.smtpMessages.length, 1);
  } finally {
    await h.close();
  }
});

test("WhatsApp preview does not send; stale targets, oversized results and ambiguous delivery cannot produce duplicates", async () => {
  let deliveries = 0,
    failNetwork = false;
  const h = await harness((async (url, init) => {
    if (String(url).includes("graph.facebook.com")) {
      deliveries++;
      if (failNetwork)
        throw new TypeError("Provider unavailable secret-context");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.template.name, "study_summary");
      assert.equal(
        body.template.components[0].parameters[0].text,
        "Use spaced practice. [1]",
      );
      return Response.json({ messages: [{ id: "whatsapp-id" }] });
    }
    const body = JSON.parse(String(init?.body));
    return reply(
      body.messages.some((m: any) => m.role === "tool")
        ? { content: "Use spaced practice. [1]" }
        : tool("search_sources", { query: "recall" }),
    );
  }) as typeof fetch);
  try {
    await approve(h.api);
    await h.api("/api/agent/connections", whatsapp);
    await h.api("/api/agent/task", task);
    await h.app.locals.agent.tick(1);
    const run = h.app.locals.agent.data.state.runs[0];
    const preview = (
      await h.api("/api/agent/delivery/preview", {
        runId: run.id,
        channel: "whatsapp",
      })
    ).data;
    assert.equal(deliveries, 0);
    await h.api("/api/agent/connections", {
      ...whatsapp,
      recipient: "+491234567891",
    });
    assert.equal(
      (await h.api("/api/agent/delivery/send", { ...preview, confirm: true }))
        .status,
      409,
    );
    assert.equal(deliveries, 0);
    const current = (
      await h.api("/api/agent/delivery/preview", {
        runId: run.id,
        channel: "whatsapp",
      })
    ).data;
    run.answer = "x".repeat(1001);
    assert.equal(
      (await h.api("/api/agent/delivery/send", { ...current, confirm: true }))
        .data.status,
      "failed",
    );
    assert.equal(deliveries, 0);
    run.answer = current.text;
    assert.equal(
      (await h.api("/api/agent/delivery/send", { ...current, confirm: true }))
        .data.status,
      "accepted",
    );
    assert.equal(deliveries, 1);
    await h.api("/api/agent/task", task);
    await h.app.locals.agent.tick(1);
    const run2 = h.app.locals.agent.data.state.runs[0];
    failNetwork = true;
    const next = (
      await h.api("/api/agent/delivery/preview", {
        runId: run2.id,
        channel: "whatsapp",
      })
    ).data;
    const uncertain = await h.api("/api/agent/delivery/send", {
      ...next,
      confirm: true,
    });
    assert.equal(uncertain.data.status, "unknown");
    assert.doesNotMatch(JSON.stringify(uncertain), /secret-context/);
    assert.equal(
      (await h.api("/api/agent/delivery/send", { ...next, confirm: true }))
        .status,
      409,
    );
    assert.equal(deliveries, 2);
  } finally {
    await h.close();
  }
});

test("connection credentials stay scoped to host and saved channel approvals survive restart; pending deliveries become uncertain", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-connections-"));
  try {
    const filename = path.join(directory, "connections.json");
    const store = new AgentConnectionStore(new SettingsStore(config), filename);
    store.save(
      connectionInput.parse({
        ...model,
        baseUrl: "https://model.example/v1",
        apiKey: "model-secret",
      }),
    );
    store.save(
      connectionInput.parse({ ...model, baseUrl: "https://other.example/v1" }),
    );
    assert.equal(store.value.model.apiKey, "");
    store.save(connectionInput.parse(email));
    store.value.model.tested = true;
    store.flush();
    const target = store.target("email");
    const restored = new AgentConnectionStore(
      new SettingsStore(config),
      filename,
    );
    assert.deepEqual(restored.target("email"), target);
    assert.equal(restored.value.model.tested, true);
    assert.equal(restored.value.email.password, "email-secret");
    assert.doesNotMatch(
      JSON.stringify(restored.public()),
      /email-secret|model-secret/,
    );
    const agentFile = path.join(directory, "agent.json"),
      data = new AgentStore(agentFile);
    data.state.runs.push({
      id: "run",
      taskId: "task",
      notebookId: "notebook",
      title: "Brief",
      status: "completed",
      startedAt: 1,
      answer: "Result",
      connection: config,
      steps: [],
      citations: [],
      materials: [],
      sent: { memoryIds: [], sourceIds: [], skill: "", prompt: "" },
      calls: 1,
      deliveries: [{ ...target, status: "sending", at: 1 }],
    });
    data.flush();
    assert.equal(
      new AgentStore(agentFile).state.runs[0].deliveries![0].status,
      "unknown",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
