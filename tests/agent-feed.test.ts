import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgentFeed, publicSourceUrl } from "../src/lib/agent-feed.ts";
import type { TraceDetail, TraceEvent, TraceSpan } from "../src/trace-types.ts";
import type { AgentRun } from "../src/agent-types.ts";

const span = (
  spanId: string,
  parentSpanId: string | undefined,
  kind: string,
  attributes: Record<string, unknown> = {},
): TraceSpan => ({
  spanId,
  parentSpanId,
  name: spanId === "web" ? "Web researcher" : spanId,
  kind,
  attributes,
  startedAt: 1,
  status: "completed",
});
const trace: TraceDetail = {
  traceId: "trace",
  notebookId: "notebook",
  runner: "personal_agent",
  name: "Compare papers",
  status: "completed",
  createdAt: 0,
  metadata: {},
  persistence: "degraded",
  spans: [
    span("main", undefined, "agent"),
    span("delegate", "main", "tool"),
    span("web", "delegate", "agent", {
      agentId: "researcher",
      kind: "web_researcher",
      assignment: "Find source papers",
    }),
    span("search", "web", "tool"),
    span("read", "web", "tool"),
  ],
};
const event = (
  sequence: number,
  type: string,
  spanId: string,
  payload: Record<string, unknown>,
): TraceEvent => ({
  sequence,
  type,
  spanId,
  payload,
  eventId: `event-${sequence}`,
  traceId: "trace",
  notebookId: "notebook",
  at: sequence,
});

test("activity follows specialist span ownership and separates search candidates from retrieved evidence", () => {
  const events = [
    event(1, "tool.call", "search", {
      tool: "search_web",
      arguments: JSON.stringify({ query: "attention papers" }),
    }),
    event(2, "tool.result", "search", {
      tool: "search_web",
      result: {
        candidates: [
          {
            id: 91,
            title: "A paper",
            url: "https://example.org/paper",
            snippet: "Search snippet",
          },
        ],
      },
    }),
    event(3, "tool.call", "read", {
      tool: "read_web",
      arguments: JSON.stringify({ url: "https://example.org/paper" }),
    }),
    event(4, "tool.result", "read", {
      tool: "read_web",
      result: {
        id: 7,
        sourceName: "A paper",
        url: "https://example.org/paper",
        text: "Retrieved page content",
      },
    }),
  ];
  const before = structuredClone(events);
  const groups = buildAgentFeed(trace, [...events].reverse());
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "Web researcher");
  assert.equal(groups[0].assignment, "Find source papers");
  assert.equal(groups[0].actions[0].query, "attention papers");
  assert.equal(groups[0].actions[0].sources[0].candidate, true);
  assert.equal(groups[0].actions[0].sources[0].citationId, undefined);
  assert.equal(groups[0].actions[1].sources[0].candidate, false);
  assert.equal(groups[0].actions[1].sources[0].citationId, 7);
  assert.deepEqual(events, before);
});

test("activity excludes private model content, unsafe links, drafts and unverified read results", () => {
  const events = [
    event(1, "model.request", "web", {
      request: { messages: [{ content: "Private system prompt" }] },
    }),
    event(2, "model.response", "web", {
      response: {
        reasoning: "Secret reasoning",
        content: "Unvalidated answer",
      },
    }),
    event(3, "tool.result", "search", {
      tool: "write_file",
      result: { id: 12, title: "Generated draft", text: "Not evidence" },
    }),
    event(4, "tool.result", "read", {
      tool: "read_web",
      result: {
        sourceName: "No registered citation",
        url: "javascript:alert(1)",
        text: "Not validated",
      },
    }),
  ];
  const groups = buildAgentFeed(trace, events);
  assert.equal(groups[0].actions.length, 2);
  assert.ok(groups[0].actions.every((action) => action.sources.length === 0));
  const text = JSON.stringify(groups);
  for (const hidden of [
    "Private system prompt",
    "Secret reasoning",
    "Unvalidated answer",
    "Not evidence",
    "javascript:",
  ])
    assert.ok(!text.includes(hidden));
  assert.equal(publicSourceUrl("javascript:alert(1)"), undefined);
  assert.equal(publicSourceUrl("https://user:password@example.org"), undefined);
  assert.equal(
    publicSourceUrl("https://example.org/paper"),
    "https://example.org/paper",
  );
});

test("interrupted traces stop unfinished action indicators without claiming completion", () => {
  const interrupted: TraceDetail = {
    ...trace,
    status: "interrupted",
    spans: trace.spans.map((s) => ({ ...s, status: "running" })),
  };
  const groups = buildAgentFeed(interrupted, [
    event(1, "tool.call", "search", { tool: "search_web", arguments: "{}" }),
  ]);
  assert.equal(groups[0].status, "interrupted");
  assert.equal(groups[0].actions[0].status, "interrupted");
  assert.match(groups[0].actions[0].summary!, /No completion/);
  assert.deepEqual(buildAgentFeed(), []);
});

test("stored agent IDs reconcile with trace span IDs and final trace state wins over an older run snapshot", () => {
  const run: AgentRun = {
    id: "run",
    taskId: "task",
    title: "Research",
    answer: "",
    citations: [],
    materials: [],
    calls: 1,
    sent: { memoryIds: [], sourceIds: [], skill: "", prompt: "Find papers" },
    notebookId: "notebook",
    status: "running",
    startedAt: 0,
    connection: { model: "test-model", baseUrl: "https://example.org/v1" },
    agents: [
      {
        id: "saved-agent",
        spanId: "web",
        name: "Web researcher",
        kind: "web_researcher",
        assignment: "Find papers",
        instructions: "",
        status: "running",
        model: "test-model",
        startedAt: 1,
        calls: 1,
        citationIds: [],
      },
    ],
    steps: [
      {
        tool: "search_web",
        summary: "Old saved step",
        at: 1,
        agentId: "saved-agent",
      },
    ],
  };
  const groups = buildAgentFeed(
    trace,
    [
      event(1, "tool.result", "search", {
        tool: "search_web",
        summary: "Recorded in trace",
        result: { candidates: [] },
      }),
    ],
    run,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "saved-agent");
  assert.equal(groups[0].status, "completed");
  assert.equal(groups[0].actions.length, 1);
  assert.equal(groups[0].actions[0].summary, "Recorded in trace");
  const completed = structuredClone(run);
  completed.agents![0].status = "completed";
  completed.agents![0].answer = "Saved findings use the paper. [7]";
  assert.equal(
    buildAgentFeed(trace, [], completed)[0].findings,
    "Saved findings use the paper. [7]",
  );
});

test("specialist findings come from validated completion events and omit private reasoning blocks", () => {
  const events = [
    event(1, "model.response", "web", {
      response: {
        content: "Unvalidated answer",
        reasoning: "Private reasoning",
      },
    }),
    event(2, "agent.completed", "web", {
      agentId: "researcher",
      answer:
        "<think>Hidden reasoning</think>Supported finding. [7]\n<analysis>Also private</analysis>",
      citationIds: [7],
    }),
  ];
  const group = buildAgentFeed(trace, events)[0];
  assert.equal(group.findings, "Supported finding. [7]");
  assert.equal(group.status, "completed");
  assert.ok(!JSON.stringify(group).includes("Unvalidated"));
  assert.ok(!JSON.stringify(group).includes("reasoning"));
  const outcome = buildAgentFeed(trace, [
    event(2, "agent.completed", "web", {
      agentId: "researcher",
      answer: "The completed searches returned no usable evidence.",
      noEvidence: true,
    }),
  ])[0];
  assert.equal(outcome.noEvidence, true);
  assert.match(outcome.findings!, /no usable evidence/);
});

test("specialist failures expose the recorded error without promoting model drafts to findings", () => {
  const group = buildAgentFeed(trace, [
    event(1, "model.response", "web", { content: "Unverified draft" }),
    event(2, "agent.failed", "web", {
      agentId: "researcher",
      error: "Page extraction failed.",
    }),
  ])[0];
  assert.equal(group.status, "failed");
  assert.equal(group.error, "Page extraction failed.");
  assert.equal(group.findings, undefined);
});
