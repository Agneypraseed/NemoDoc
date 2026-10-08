import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { AgentStore } from "../server/agent-store.ts";
import { AgentWorker } from "../server/agent.ts";
import { SettingsStore, providerJSON } from "../server/settings.ts";
import { createApp } from "../server/app.ts";
import { taskInput } from "../src/agent-types.ts";

const config = {
  apiKey: "private-key",
  baseUrl: "https://api.tokenfactory.nebius.com/v1",
  model: "nvidia/test-nemotron",
};
function setup(fetcher: typeof fetch, filename?: string) {
  const data = new AgentStore(filename),
    settings = new SettingsStore(config);
  data.state.sources = [
    {
      id: "allowed",
      notebookId: "notebook",
      name: "Study.pdf",
      pages: ["Attention is finite. Review with spaced practice."],
    },
  ];
  data.state.memories = [
    {
      id: "goal",
      notebookId: "notebook",
      kind: "goal",
      text: "Exam in one week",
      deadline: "2026-10-15",
      updatedAt: 1,
    },
    {
      id: "secret",
      notebookId: "other",
      kind: "preference",
      text: "Other notebook private context",
      deadline: "",
      updatedAt: 1,
    },
  ];
  const task = {
    ...taskInput.parse({
      notebookId: "notebook",
      title: "Prepare for exam",
      prompt: "Prepare a plan and study guide.",
      skillId: "exam-prep",
      sourceIds: ["allowed"],
      dueAt: 100,
    }),
    id: "task",
    status: "active" as const,
    connection: { baseUrl: config.baseUrl, model: config.model },
    createdAt: 1,
  };
  data.state.tasks.push(task);
  const worker = new AgentWorker(data, settings, fetcher);
  return { data, settings, task, worker };
}
const reply = (message: unknown) =>
  Response.json({ id: "response-test", choices: [{ message }] });
const calls = (name: string, args: unknown) => ({
  content: null,
  tool_calls: [
    {
      id: "call-" + name,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});

test("personal agent executes real tools, scopes memory, validates citations and persists plan/materials without provider credentials", async () => {
  const sent: any[] = [];
  const { data, worker, task } = setup((async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    sent.push(body);
    if (sent.length === 1)
      return reply(calls("search_sources", { query: "attention" }));
    if (sent.length === 2)
      return reply(
        calls("update_plan", { text: "Review attention tomorrow." }),
      );
    if (sent.length === 3)
      return reply(
        calls("save_study_material", {
          kind: "guide",
          title: "Attention guide",
          content: "Attention is finite. [1]",
          items: [],
        }),
      );
    return reply({ content: "I saved your guide and study plan. [1]" });
  }) as typeof fetch);
  await worker.tick(100);
  const run = data.state.runs[0];
  assert.equal(run.status, "completed");
  assert.equal(task.status, "done");
  assert.equal(run.calls, 4);
  assert.equal(data.state.plans[0].text, "Review attention tomorrow.");
  assert.equal(run.materials.length, 1);
  assert.deepEqual(run.sent.memoryIds, ["goal"]);
  assert.doesNotMatch(sent[0].messages[0].content, /Other notebook/);
  assert.deepEqual(sent[1].messages.at(-1).role, "tool");
  assert.equal(sent[1].messages.at(-1).tool_call_id, "call-search_sources");
  assert.equal(sent[0].chat_template_kwargs, undefined);
  assert.match(sent[0].model, /nvidia/);
  assert.doesNotMatch(JSON.stringify(data.public()), /private-key/);
  assert.equal("pages" in data.public().sources[0], false);
  assert.equal(data.state.receipts[0].model, config.model);
});

test("unauthorized tool and forged source/citations cannot mutate state and loop is bounded", async () => {
  let count = 0;
  const { data, worker, task } = setup((async () => {
    count++;
    return reply(
      count === 1
        ? calls("remember_progress", { text: "I mastered it" })
        : count === 2
          ? calls("read_passage", { sourceId: "secret-source", page: 1 })
          : calls("save_study_material", {
              kind: "guide",
              title: "Forged",
              content: "Claim [999]",
              items: [],
            }),
    );
  }) as typeof fetch);
  await worker.tick(100);
  assert.equal(count, 8);
  assert.equal(data.state.runs[0].status, "failed");
  assert.equal(task.status, "paused");
  assert.equal(data.state.runs[0].materials.length, 0);
  assert.equal(data.state.memories.length, 2);
  assert.match(data.state.runs[0].steps[0].summary, /not authorized/);
  assert.match(data.state.runs[0].steps[1].summary, /outside/);
});

test("memory and scheduling permission permits one non-recursive follow-up and real progress updates", async () => {
  let n = 0;
  const { data, worker, task } = setup((async () => {
    n++;
    return reply(
      n === 1
        ? calls("search_sources", { query: "overview" })
        : n === 2
          ? calls("remember_progress", {
              text: "User reports difficulty with spaced practice",
            })
          : n === 3 || n === 4
            ? calls("schedule_review", {
                prompt: "Review attention",
                hoursFromNow: 24,
              })
            : { content: "A review is scheduled. [1]" },
    );
  }) as typeof fetch);
  task.allowMemory = true;
  task.allowSchedule = true;
  await worker.tick(100);
  assert.equal(data.state.tasks.length, 2);
  assert.equal(data.state.tasks[1].allowSchedule, false);
  assert.equal(data.state.tasks[1].repeatHours, 0);
  assert.deepEqual(data.state.tasks[1].sourceIds, ["allowed"]);
  assert.equal(data.state.memories.length, 3);
  assert.match(data.state.runs[0].steps.at(-1)!.summary, /Only one/);
});

test("server-side scheduler survives reload, skips replay of interrupted runs, runs overdue recurring task once", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-agent-"));
  try {
    let n = 0;
    const { data, worker, task } = setup(
      (async () =>
        reply(
          ++n % 2 === 1
            ? calls("search_sources", { query: "overview" })
            : { content: "Review this. [1]" },
        )) as typeof fetch,
      path.join(directory, "agent.json"),
    );
    task.repeatHours = 24;
    await worker.tick(100);
    await worker.tick(100);
    assert.equal(n, 2);
    assert.equal(task.dueAt, 100 + 24 * 3600000);
    assert.equal(task.status, "active");
    data.state.runs[0].status = "running";
    data.flush();
    const reloaded = new AgentStore(path.join(directory, "agent.json"));
    assert.equal(reloaded.state.runs[0].status, "interrupted");
    assert.equal(reloaded.state.memories[0].text, "Exam in one week");
    const restarted = new AgentWorker(
      reloaded,
      new SettingsStore(config),
      (async () =>
        reply(
          ++n % 2 === 1
            ? calls("search_sources", { query: "overview" })
            : { content: "Review again. [1]" },
        )) as typeof fetch,
    );
    await restarted.tick(100 + 10 * 24 * 3600000);
    assert.equal(n, 4);
    assert.equal(reloaded.state.runs.length, 2);
    assert.equal(reloaded.state.tasks[0].dueAt, 100 + 11 * 24 * 3600000);
  } finally {
    assert.ok(
      path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep),
    );
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cancellation aborts in-flight inference; one worker never overlaps runs", async () => {
  let entered!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  let count = 0;
  const { data, worker, task } = setup((async (_url, init) => {
    count++;
    entered();
    return new Promise<Response>((_resolve, reject) =>
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Stopped", "AbortError")),
        { once: true },
      ),
    );
  }) as typeof fetch);
  const execution = worker.tick(100);
  await started;
  await worker.tick(100);
  assert.equal(count, 1);
  task.status = "cancelled" as any;
  worker.abort(task.id);
  await execution;
  assert.equal(data.state.runs[0].status, "cancelled");
  assert.equal(data.state.runs[0].materials.length, 0);
});

test("source revocation or a changed provider pauses work before any inference", async () => {
  for (const reason of ["sources", "provider"]) {
    let count = 0;
    const { data, worker, settings } = setup((async () => {
      count++;
      return reply({ content: "No" });
    }) as typeof fetch);
    if (reason === "sources") data.state.sources = [];
    else settings.value.baseUrl = "https://integrate.api.nvidia.com/v1";
    await worker.tick(100);
    assert.equal(count, 0);
    assert.equal(data.state.tasks[0].status, "paused");
    assert.equal(data.state.runs[0].status, "failed");
  }
});

test("credential is never sent to a different provider capability host", async () => {
  let called = false;
  const settings = new SettingsStore(config).value;
  await assert.rejects(
    providerJSON(
      (async () => {
        called = true;
        return reply({ content: "ready" });
      }) as typeof fetch,
      "https://integrate.api.nvidia.com/v1/embeddings",
      {},
      settings,
    ),
    /same provider/,
  );
  assert.equal(called, false);
});

test("agent API requires source consent, validates notebook scope, returns safe model catalog and stores runtime receipt", async () => {
  const app = createApp(config, (async (url) =>
    String(url).endsWith("/models")
      ? Response.json({ data: [{ id: "nvidia/nemotron-test" }] })
      : reply({ content: "ready" })) as typeof fetch);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (p: string, b: unknown) =>
    fetch(url + p, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
  try {
    assert.equal(
      (await post("/api/agent/sources", { notebookId: "n", sources: [] }))
        .status,
      400,
    );
    assert.equal(
      (
        await post("/api/agent/sources", {
          notebookId: "n",
          consent: true,
          sources: [
            { id: "s", notebookId: "other", name: "x", pages: ["text"] },
          ],
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await post("/api/agent/sources", {
          notebookId: "n",
          consent: true,
          sources: [{ id: "s", notebookId: "n", name: "x", pages: ["text"] }],
        })
      ).status,
      200,
    );
    const task = await (
      await post("/api/agent/task", {
        notebookId: "n",
        title: "Study",
        prompt: "Help",
        skillId: "exam-prep",
        sourceIds: ["s"],
        dueAt: 0,
      })
    ).json();
    assert.equal(task.status, "active");
    assert.equal(
      (await post("/api/agent/sources/revoke", { notebookId: "n", id: "s" }))
        .status,
      200,
    );
    assert.equal(app.locals.agent.data.state.tasks[0].status, "paused");
    assert.deepEqual((await (await fetch(url + "/api/models")).json()).models, [
      "nvidia/nemotron-test",
    ]);
    assert.equal((await post("/api/settings/test", {})).status, 200);
    const state = await (await fetch(url + "/api/agent")).json();
    assert.equal(state.receipts[0].method, "connection test");
    assert.doesNotMatch(JSON.stringify(state), /private-key/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
