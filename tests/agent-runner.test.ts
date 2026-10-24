import test from "node:test";
import assert from "node:assert/strict";
import {
  runNotebookAgent,
  runTextAgent,
  type ChatMessage,
  type AgentToolCall,
} from "../server/agent-runner.ts";

const reply = (content: string | null, tool_calls?: AgentToolCall[]) => ({
  choices: [{ message: { content, tool_calls } }],
});
const call = (id: string, name = "read"): AgentToolCall => ({
  id,
  type: "function",
  function: { name, arguments: '{"page":1}' },
});
const definition = (name: string) => ({
  type: "function",
  function: {
    name,
    description: "Scoped fixture tool",
    parameters: { type: "object", properties: { page: { type: "integer" } } },
  },
});
const setup = () => ({
  name: "Fixture specialist",
  messages: [
    { role: "system", content: "Read only approved fixture evidence." },
    { role: "user", content: "Investigate the fixture." },
  ] as ChatMessage[],
  tools: [definition("read")],
  maxCalls: 3,
  signal: new AbortController().signal,
  limitMessage: () => "Fixture model budget exhausted.",
});

test("SDK dispatch preserves ordered tool results and makes no external tracing requests", async () => {
  const options = setup();
  let calls = 0;
  const order: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Unexpected external request");
  };
  try {
    await runNotebookAgent({
      ...options,
      request: async () => {
        calls++;
        assert.equal(
          options.messages[0].content,
          "Read only approved fixture evidence.",
        );
        if (calls === 1) return reply(null, [call("first"), call("second")]);
        assert.deepEqual(
          options.messages
            .filter((m) => m.role === "tool")
            .map((m) => [m.tool_call_id, JSON.parse(m.content!)]),
          [
            ["first", { evidence: "first" }],
            ["second", { evidence: "second" }],
          ],
        );
        return reply("A grounded finding [1].");
      },
      executeTool: async (toolCall) => {
        order.push(toolCall.id);
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(
          order.at(-1),
          toolCall.id,
          "Local tools must execute serially",
        );
        return { evidence: toolCall.id };
      },
      accept: async (message) => {
        assert.equal(message.content, "A grounded finding [1].");
        return true;
      },
    });
    assert.equal(calls, 2);
    assert.deepEqual(order, ["first", "second"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("citation repair retains evidence history within the same total model budget", async () => {
  const options = setup();
  let calls = 0;
  await runNotebookAgent({
    ...options,
    request: async () => {
      calls++;
      if (calls === 1) return reply(null, [call("read-source")]);
      if (calls === 2) return reply("Unsupported [999].");
      assert.ok(
        options.messages.some(
          (m) => m.role === "tool" && m.content?.includes("original excerpt"),
        ),
      );
      assert.equal(
        options.messages.at(-1)?.content,
        "Use the retrieved citation [1].",
      );
      return reply("Supported [1].");
    },
    executeTool: async () => ({ id: 1, text: "original excerpt" }),
    accept: async (message) => {
      if (message.content === "Supported [1].") return true;
      options.messages.push(
        { role: "assistant", content: message.content ?? "" },
        { role: "user", content: "Use the retrieved citation [1]." },
      );
      return false;
    },
  });
  assert.equal(calls, 3);
});

test("a terminal proposal stops without another inference call or sibling action", async () => {
  let done: string | undefined;
  const actions: string[] = [];
  let calls = 0;
  await runNotebookAgent({
    ...setup(),
    tools: [definition("propose"), definition("read")],
    completed: () => done,
    request: async () => {
      calls++;
      return reply(null, [call("proposal", "propose"), call("late-read")]);
    },
    executeTool: async (toolCall) => {
      actions.push(toolCall.function.name);
      done = "Proposal requires review.";
      return { proposalId: "fixture" };
    },
    accept: async () => {
      throw new Error(
        "A validated proposal should finish through SDK tool behavior",
      );
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(actions, ["propose"]);
});

test("unknown tools reach the application's rejection and audit handler", async () => {
  const options = setup();
  let calls = 0;
  const rejected: string[] = [];
  await runNotebookAgent({
    ...options,
    request: async () => {
      if (++calls === 1) return reply(null, [call("forged", "send_mail")]);
      assert.match(
        options.messages.find((m) => m.role === "tool")?.content ?? "",
        /not authorized/,
      );
      return reply("No external action occurred.");
    },
    executeTool: async (toolCall) => {
      rejected.push(toolCall.function.name);
      return { error: "This tool is not authorized." };
    },
    accept: async () => true,
  });
  assert.deepEqual(rejected, ["send_mail"]);
});

test("SDK does not replay a repeated tool call ID", async () => {
  let calls = 0,
    actions = 0;
  await runNotebookAgent({
    ...setup(),
    request: async () =>
      ++calls < 3 ? reply(null, [call("same")]) : reply("Done [1]."),
    executeTool: async () => {
      actions++;
      return { id: 1 };
    },
    accept: async () => true,
  });
  assert.equal(calls, 3);
  assert.equal(actions, 1);
});

test("duplicate call IDs in one response fail before any tool action", async () => {
  let actions = 0;
  await assert.rejects(
    runNotebookAgent({
      ...setup(),
      request: async () => reply(null, [call("duplicate"), call("duplicate")]),
      executeTool: async () => {
        actions++;
        return {};
      },
      accept: async () => true,
    }),
    /duplicate tool call IDs/,
  );
  assert.equal(actions, 0);
});

test("cancellation between tools prevents queued tool actions", async () => {
  const controller = new AbortController();
  let actions = 0;
  await assert.rejects(
    runNotebookAgent({
      ...setup(),
      signal: controller.signal,
      request: async () => reply(null, [call("first"), call("second")]),
      executeTool: async () => {
        actions++;
        controller.abort();
        return {};
      },
      accept: async () => true,
    }),
  );
  assert.equal(actions, 1);
});

test("provider failures are not silently retried; model budgets also bound SDK continuations", async () => {
  let calls = 0;
  await assert.rejects(
    runNotebookAgent({
      ...setup(),
      request: async () => {
        calls++;
        throw new Error("Provider unavailable");
      },
      executeTool: async () => ({}),
      accept: async () => true,
    }),
    /Provider unavailable/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    runNotebookAgent({
      ...setup(),
      request: async () => reply(null, [call(`read-${++calls}`)]),
      executeTool: async () => ({}),
      accept: async () => true,
    }),
    /Fixture model budget exhausted/,
  );
  assert.equal(calls, 3);
});

test("an empty model answer reaches domain validation without spending extra calls", async () => {
  let calls = 0,
    validations = 0;
  await runNotebookAgent({
    ...setup(),
    request: async () => {
      calls++;
      return reply("");
    },
    executeTool: async () => ({}),
    accept: async (message) => {
      validations++;
      assert.equal(message.content, "");
      return true;
    },
  });
  assert.equal(calls, 1);
  assert.equal(validations, 1);
});

test("the SDK planner rejects tools while preserving application conflict errors", async () => {
  const options = setup();
  const conflict = new Error("Planning returned tools instead of assignments.");
  await assert.rejects(
    runTextAgent({
      name: "Fixture planner",
      messages: options.messages,
      signal: options.signal,
      request: async () => reply(null, [call("forged")]),
      rejectTools: () => conflict,
    }),
    (error) => error === conflict,
  );
});
