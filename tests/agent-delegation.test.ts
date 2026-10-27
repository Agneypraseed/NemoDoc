import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AgentWorker } from "../server/agent.ts";
import { AgentStore } from "../server/agent-store.ts";
import { SettingsStore } from "../server/settings.ts";
import { TraceStore } from "../server/trace-store.ts";
import { WebResearch } from "../server/workspace/web-research.ts";
import { taskInput } from "../src/agent-types.ts";

const config = {
  baseUrl: "https://integrate.api.nvidia.com/v1",
  model: "nvidia/test-nemotron",
  apiKey: "private-provider-key",
};
const pageUrl = "https://93.184.216.34/paper";
const call = (name: string, args: unknown) => ({
  content: null,
  tool_calls: [
    {
      id: randomUUID(),
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});
const reply = (message: unknown) =>
  Response.json({ id: randomUUID(), choices: [{ message }] });
const lastOutput = (body: any) =>
  JSON.parse(
    body.messages.filter((m: any) => m.role === "tool").at(-1)?.content ??
      "null",
  );
function fixture(
  fetcher: typeof fetch,
  extra: Record<string, unknown> = {},
  filename?: string,
  traces?: TraceStore,
  web?: WebResearch,
) {
  const data = new AgentStore(filename);
  data.state.sources = [
    {
      id: "allowed",
      notebookId: "notebook",
      name: "Lecture.pdf",
      pages: ["Attention uses weighted values from source tokens."],
    },
    {
      id: "foreign",
      notebookId: "other",
      name: "Private.pdf",
      pages: ["PRIVATE_OTHER_NOTEBOOK"],
    },
  ];
  const task = {
    ...taskInput.parse({
      notebookId: "notebook",
      sourceIds: ["allowed"],
      title: "Compare sources",
      prompt: "Compare the lecture with public papers.",
      instructions: "Keep the answer concise.",
      agentInstructions: {
        researcher: "Explain assumptions.",
        webResearcher: "Prefer original papers.",
      },
      skillId: "autonomous-tools",
      dueAt: 100,
      allowDelegation: true,
      ...extra,
    }),
    id: "task",
    status: "active" as const,
    connection: config,
    createdAt: 1,
  };
  data.state.tasks.push(task);
  const worker = new AgentWorker(
    data,
    new SettingsStore(config),
    fetcher,
    undefined,
    traces,
    web,
  );
  return { data, worker, task };
}

test("main SDK agent delegates notebook and web research concurrently, retains citations and persisted nested traces", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-delegation-"));
  const traceFile = path.join(directory, "traces.jsonl");
  const traces = new TraceStore(undefined, traceFile, () => [
    config.apiKey,
    "private-search-key",
  ]);
  try {
    const requests: any[] = [];
    let searches = 0,
      reads = 0;
    const fetcher = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const body = JSON.parse(String(init?.body));
      if (String(url).endsWith("/search")) {
        searches++;
        return Response.json({
          results: [{ title: "Original paper", url: pageUrl }],
        });
      }
      if (String(url).endsWith("/extract")) {
        reads++;
        return Response.json({
          results: [
            {
              url: pageUrl,
              raw_content:
                "The paper defines attention as weighted token values.",
            },
          ],
        });
      }
      requests.push(body);
      assert.doesNotMatch(
        JSON.stringify(body),
        /PRIVATE_OTHER_NOTEBOOK|private-provider-key/,
      );
      const system = body.messages[0].content;
      const tools = body.tools.map((tool: any) => tool.function.name);
      const output = lastOutput(body);
      if (system.includes("You are Lecture researcher")) {
        assert.deepEqual(tools.sort(), ["read_passage", "search_sources"]);
        assert.match(system, /Explain assumptions/);
        return reply(
          output
            ? {
                content: `The lecture describes weighted token values [${output.id}].`,
              }
            : call("read_passage", { sourceId: "allowed", page: 1 }),
        );
      }
      if (system.includes("You are Paper researcher")) {
        assert.deepEqual(tools.sort(), ["read_web", "search_web"]);
        assert.doesNotMatch(system, /Lecture\.pdf|Attention uses/);
        assert.match(system, /Prefer original papers/);
        return reply(
          !output
            ? call("search_web", { query: "attention original paper" })
            : output.candidates
              ? call("read_web", { url: output.candidates[0].url })
              : {
                  content: `The paper defines attention using weighted token values [${output.id}].`,
                },
        );
      }
      assert.ok(tools.includes("delegate_agents"));
      assert.match(system, /Keep the answer concise/);
      return reply(
        !output
          ? call("delegate_agents", {
              agents: [
                {
                  name: "Lecture researcher",
                  kind: "researcher",
                  instructions: "Explain the lecture.",
                },
                {
                  name: "Paper researcher",
                  kind: "web_researcher",
                  instructions: "Find and read an original attention paper.",
                },
              ],
            })
          : {
              content:
                "The lecture and paper agree on weighted token values [" +
                output.agents
                  .flatMap((agent: any) =>
                    agent.citations.map((c: any) => c.id),
                  )
                  .join(", ") +
                "].",
            },
      );
    }) as typeof fetch;
    const web = new WebResearch(undefined, fetcher);
    web.save({ apiKey: "private-search-key" });
    web.value.tested = true;
    const filename = path.join(directory, "agent.json");
    const { data, worker } = fixture(
      fetcher,
      { allowWeb: true, webRevision: web.value.revision },
      filename,
      traces,
      web,
    );
    await worker.tick(100);
    const run = data.state.runs[0];
    assert.equal(run.status, "completed", run.error);
    assert.equal(run.calls, 7);
    assert.equal(run.modelCallLimit, 34);
    assert.equal(searches, 1);
    assert.equal(reads, 1);
    assert.equal(run.agents?.length, 2);
    assert.ok(
      run.agents!.every(
        (agent) => agent.status === "completed" && agent.spanId && agent.answer,
      ),
    );
    assert.deepEqual(
      run.agents!.map((agent) => agent.calls),
      [2, 3],
    );
    assert.equal(new Set(run.citations.map((c) => c.id)).size, 2);
    assert.equal(run.citations.find((c) => c.kind === "web")?.url, pageUrl);
    assert.equal(run.steps.filter((step) => step.agentId).length, 3);
    assert.equal(run.sent.instructions, "Keep the answer concise.");
    const restored = new AgentStore(filename);
    assert.deepEqual(restored.state.runs[0].agents, run.agents);
    const persistedTraces = new TraceStore(undefined, traceFile);
    const detail = await persistedTraces.detail("notebook", run.id);
    assert.equal(detail?.status, "completed");
    const childSpans = detail!.spans.filter(
      (span) => span.kind === "agent" && span.attributes.agentId,
    );
    const modelSpans = detail!.spans.filter(
      (span) => span.kind === "model_call",
    );
    assert.equal(new Set(modelSpans.map((span) => span.attempt)).size, 7);
    assert.equal(childSpans.length, 2);
    assert.ok(
      childSpans.every(
        (span) => span.parentSpanId && span.status === "completed",
      ),
    );
    assert.equal(await persistedTraces.detail("other", run.id), undefined);
    assert.doesNotMatch(
      readFileSync(traceFile, "utf8"),
      /private-provider-key|private-search-key|PRIVATE_OTHER_NOTEBOOK/,
    );
    await persistedTraces.close();
  } finally {
    await traces.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a main agent with evidence gets a final answer turn at its delegation limit", async () => {
  let mainCalls = 0;
  const { data, worker } = fixture(
    (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.messages[0].content.includes("You are Source researcher")) {
        const result = lastOutput(body);
        return reply(
          result
            ? { content: "The source describes weighted values. [1]" }
            : call("read_passage", { sourceId: "allowed", page: 1 }),
        );
      }
      mainCalls++;
      if (mainCalls === 1)
        return reply(
          call("delegate_agents", {
            agents: [
              {
                name: "Source researcher",
                kind: "researcher",
                instructions: "Explain the source.",
              },
            ],
          }),
        );
      if (mainCalls < 10)
        return reply(call("read_passage", { sourceId: "allowed", page: 1 }));
      assert.equal(body.tool_choice, "none");
      assert.deepEqual(body.tools, []);
      return reply({ content: "The source describes weighted values. [1]" });
    }) as typeof fetch,
    { allowDelegation: true },
  );
  await worker.tick(100);
  assert.equal(mainCalls, 10);
  assert.equal(
    data.state.runs[0].status,
    "completed",
    data.state.runs[0].error,
  );
});

test("a specialist with evidence gets a final answer turn instead of another tool call", async () => {
  let childCalls = 0;
  const { data, worker } = fixture(
    (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const system = body.messages[0].content;
      if (system.includes("You are Patient researcher")) {
        childCalls++;
        if (childCalls < 6)
          return reply(call("read_passage", { sourceId: "allowed", page: 1 }));
        assert.equal(body.tool_choice, "none");
        assert.deepEqual(body.tools, []);
        assert.match(body.messages.at(-1).content, /final model call/);
        return reply({
          content: "The source describes weighted token values. [1]",
        });
      }
      const output = lastOutput(body);
      return reply(
        output
          ? { content: "The researcher found weighted token values. [1]" }
          : call("delegate_agents", {
              agents: [
                {
                  name: "Patient researcher",
                  kind: "researcher",
                  instructions: "Read and explain the source.",
                },
              ],
            }),
      );
    }) as typeof fetch,
    { allowDelegation: true },
  );
  await worker.tick(100);
  assert.equal(childCalls, 6);
  assert.equal(
    data.state.runs[0].status,
    "completed",
    data.state.runs[0].error,
  );
  assert.equal(data.state.runs[0].agents?.[0].status, "completed");
});

for (const allowDelegation of [false, true])
  test(`unapproved ${allowDelegation ? "web delegation" : "delegation"} cannot start a specialist`, async () => {
    let requests = 0;
    const { data, worker } = fixture(
      (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        requests++;
        if (requests === 1)
          return reply(
            call("delegate_agents", {
              agents: [
                {
                  name: "Web",
                  kind: "web_researcher",
                  instructions: "Read public pages.",
                },
              ],
            }),
          );
        if (requests === 2) {
          assert.match(lastOutput(body).error, /not authorized|not enabled/);
          return reply(call("read_passage", { sourceId: "allowed", page: 1 }));
        }
        return reply({ content: "The lecture uses weighted values [1]." });
      }) as typeof fetch,
      { allowDelegation },
    );
    await worker.tick(100);
    assert.equal(data.state.runs[0].status, "completed");
    assert.equal(data.state.runs[0].agents?.length, 0);
    assert.equal(data.state.runs[0].steps[0].status, "rejected");
  });

test("specialist cannot mutate data, delegate recursively, or read another notebook", async () => {
  let specialistCalls = 0;
  const { data, worker } = fixture((async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const output = lastOutput(body);
    if (body.messages[0].content.includes("You are Scoped researcher")) {
      specialistCalls++;
      assert.ok(
        body.tools.every((tool: any) =>
          ["read_passage", "search_sources"].includes(tool.function.name),
        ),
      );
      if (specialistCalls === 1)
        return reply({
          content: null,
          tool_calls: [
            ...call("update_plan", { text: "Unauthorized write" }).tool_calls,
            ...call("delegate_agents", {
              agents: [
                {
                  name: "Recursive",
                  kind: "researcher",
                  instructions: "Spawn again",
                },
              ],
            }).tool_calls,
            ...call("read_passage", { sourceId: "foreign", page: 1 })
              .tool_calls,
          ],
        });
      if (specialistCalls === 2) {
        assert.ok(
          body.messages.some(
            (message: any) =>
              message.role === "tool" && /outside/.test(message.content),
          ),
        );
        return reply(call("read_passage", { sourceId: "allowed", page: 1 }));
      }
      return reply({
        content: `The permitted lecture explains attention [${output.id}].`,
      });
    }
    return reply(
      !output
        ? call("delegate_agents", {
            agents: [
              {
                name: "Scoped researcher",
                kind: "researcher",
                instructions: "Read selected material.",
              },
            ],
          })
        : { content: "The lecture explains attention [1]." },
    );
  }) as typeof fetch);
  await worker.tick(100);
  const run = data.state.runs[0];
  assert.equal(run.status, "completed", run.error);
  assert.equal(run.agents?.length, 1);
  assert.equal(run.agents?.[0].status, "completed");
  assert.equal(data.state.plans.length, 0);
  assert.equal(run.citations.length, 1);
  assert.equal(run.citations[0].sourceId, "allowed");
  assert.equal(
    run.steps.filter((step) => step.status === "rejected").length,
    2,
  );
  assert.equal(run.steps.filter((step) => step.status === "failed").length, 1);
});

test("cancelling the main task interrupts specialists before a late provider response can execute tools", async () => {
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { data, worker } = fixture((async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.messages[0].content.includes("You are Slow researcher")) {
      started();
      await gate;
      return reply(call("read_passage", { sourceId: "allowed", page: 1 }));
    }
    return reply(
      call("delegate_agents", {
        agents: [
          {
            name: "Slow researcher",
            kind: "researcher",
            instructions: "Read the lecture.",
          },
        ],
      }),
    );
  }) as typeof fetch);
  const running = worker.tick(100);
  await waiting;
  worker.abort("task");
  release();
  await running;
  const run = data.state.runs[0];
  assert.equal(run.status, "cancelled");
  assert.equal(run.agents?.[0].status, "interrupted");
  assert.equal(run.citations.length, 0);
  assert.equal(run.steps.filter((step) => step.agentId).length, 0);
});

test("delegation enforces the four-specialist cap across separate batches", async () => {
  let parentCalls = 0;
  const { data, worker } = fixture((async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const output = lastOutput(body);
    if (body.messages[0].content.includes("assisting NemoDoc's main agent"))
      return reply(
        output
          ? { content: `The lecture explains attention [${output.id}].` }
          : call("read_passage", { sourceId: "allowed", page: 1 }),
      );
    parentCalls++;
    if (parentCalls <= 3)
      return reply(
        call("delegate_agents", {
          agents: Array.from(
            { length: parentCalls === 1 ? 3 : 1 },
            (_, index) => ({
              name: `Researcher ${parentCalls}-${index}`,
              kind: "researcher",
              instructions: "Explain attention.",
            }),
          ),
        }),
      );
    assert.match(output.error, /at most four/);
    return reply({ content: "Attention uses weighted token values [1]." });
  }) as typeof fetch);
  await worker.tick(100);
  const run = data.state.runs[0];
  assert.equal(run.status, "completed", run.error);
  assert.equal(run.agents?.length, 4);
  assert.equal(run.calls, 12);
  assert.equal(
    run.steps.filter(
      (step) => step.tool === "delegate_agents" && step.status === "rejected",
    ).length,
    1,
  );
});

test("fabricated specialist citations are rejected and cannot be returned as a successful answer", async () => {
  let parentCalls = 0;
  const { data, worker } = fixture((async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const output = lastOutput(body);
    if (body.messages[0].content.includes("You are Unreliable researcher"))
      return reply(
        output
          ? { content: "Unsupported findings [999]." }
          : call("read_passage", { sourceId: "allowed", page: 1 }),
      );
    parentCalls++;
    if (parentCalls === 1)
      return reply(
        call("delegate_agents", {
          agents: [
            {
              name: "Unreliable researcher",
              kind: "researcher",
              instructions: "Read the lecture.",
            },
          ],
        }),
      );
    if (parentCalls === 2) {
      assert.equal(output.agents[0].status, "failed");
      assert.equal(output.agents[0].answer, undefined);
      return reply(call("read_passage", { sourceId: "allowed", page: 1 }));
    }
    return reply({ content: "The lecture explains weighted values [1]." });
  }) as typeof fetch);
  await worker.tick(100);
  const run = data.state.runs[0];
  assert.equal(run.status, "completed", run.error);
  assert.equal(run.agents?.[0].status, "failed");
  assert.equal(run.agents?.[0].answer, undefined);
  assert.match(run.agents![0].error!, /supported by evidence/);
});

test("reloading a running task records its specialists as interrupted without replay", async () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "nemodoc-delegate-recovery-"),
  );
  try {
    const filename = path.join(directory, "agent.json");
    const { data, worker } = fixture(
      (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const output = lastOutput(body);
        if (body.messages[0].content.includes("You are Researcher"))
          return reply(
            output
              ? { content: "Attention is weighted [1]." }
              : call("read_passage", { sourceId: "allowed", page: 1 }),
          );
        return reply(
          output
            ? { content: "Attention is weighted [1]." }
            : call("delegate_agents", {
                agents: [
                  {
                    name: "Researcher",
                    kind: "researcher",
                    instructions: "Read the lecture.",
                  },
                ],
              }),
        );
      }) as typeof fetch,
      {},
      filename,
    );
    await worker.tick(100);
    data.state.runs[0].status = "running";
    data.state.runs[0].agents![0].status = "running";
    data.flush();
    const restored = new AgentStore(filename);
    assert.equal(restored.state.runs[0].status, "interrupted");
    assert.equal(restored.state.runs[0].agents![0].status, "interrupted");
    assert.equal(restored.state.tasks[0].status, "done");
    assert.equal(restored.state.runs.length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const extractionFails of [false, true])
  test(`web specialist reports ${extractionFails ? "failed extraction" : "empty search results"} without inventing evidence`, async () => {
    const fetcher = (async (url, init) => {
      const body = JSON.parse(String(init?.body));
      if (String(url).endsWith("/search"))
        return Response.json({
          results: extractionFails ? [{ title: "Paper", url: pageUrl }] : [],
        });
      if (String(url).endsWith("/extract"))
        return Response.json({ error: "Unavailable" }, { status: 503 });
      const output = lastOutput(body);
      if (body.messages[0].content.includes("You are Web researcher")) {
        if (!output)
          return reply(
            call("search_web", { query: "original attention paper" }),
          );
        if (output.candidates?.length)
          return reply(call("read_web", { url: pageUrl }));
        return reply({ content: "Invented claim without evidence [999]." });
      }
      if (!output)
        return reply(
          call("delegate_agents", {
            agents: [
              {
                name: "Web researcher",
                kind: "web_researcher",
                instructions: "Find and read papers.",
              },
            ],
          }),
        );
      if (extractionFails) {
        assert.equal(output.agents[0].status, "failed");
        assert.match(output.agents[0].error, /retrieval requests failed/);
      } else {
        assert.equal(output.agents[0].status, "completed");
        assert.equal(output.agents[0].noEvidence, true);
      }
      return reply({ content: "An invented final answer [999]." });
    }) as typeof fetch;
    const web = new WebResearch(undefined, fetcher);
    web.save({ apiKey: "test-search-key" });
    web.value.tested = true;
    const { data, worker } = fixture(
      fetcher,
      { sourceIds: [], allowWeb: true, webRevision: web.value.revision },
      undefined,
      undefined,
      web,
    );
    await worker.tick(100);
    const run = data.state.runs[0];
    assert.equal(run.citations.length, 0);
    assert.equal(
      run.status,
      extractionFails ? "failed" : "completed",
      run.error,
    );
    assert.doesNotMatch(
      run.answer + (run.agents?.[0].answer || ""),
      /Invented|invented|999/,
    );
    if (extractionFails) assert.match(run.error!, /retrieval requests failed/);
    else assert.match(run.answer, /no usable evidence/);
  });

test("a suspended-machine deadline interrupts delegated work before late tool calls", async () => {
  const originalNow = Date.now;
  try {
    const { data, worker } = fixture((async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.messages[0].content.includes("You are Delayed researcher")) {
        Date.now = () => originalNow() + 300001;
        return reply(call("read_passage", { sourceId: "allowed", page: 1 }));
      }
      return reply(
        call("delegate_agents", {
          agents: [
            {
              name: "Delayed researcher",
              kind: "researcher",
              instructions: "Read the lecture.",
            },
          ],
        }),
      );
    }) as typeof fetch);
    await worker.tick(100);
    const run = data.state.runs[0];
    assert.equal(run.status, "cancelled");
    assert.equal(run.agents?.[0].status, "interrupted");
    assert.equal(run.citations.length, 0);
  } finally {
    Date.now = originalNow;
  }
});
