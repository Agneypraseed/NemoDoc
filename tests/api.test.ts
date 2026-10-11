import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp, type Config } from "../server/app.ts";

const config: Config = {
  apiKey: "",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  model: "nvidia/nemotron-3-nano-30b-a3b",
};
const body = {
  question: "Explain attention",
  sources: [{ id: "pdf", name: "Paper.pdf", pages: ["Attention is finite."] }],
  history: [],
};
async function withApp(
  settings: Config,
  fn: (url: string) => Promise<void>,
  fetcher?: typeof fetch,
) {
  const server = createApp(settings, fetcher).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
test("status does not expose credentials and missing key gives actionable error", async () => {
  await withApp(config, async (url) => {
    assert.deepEqual(await (await fetch(url + "/api/status")).json(), {
      configured: false,
      model: config.model,
      local: false,
    });
    const response = await fetch(url + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /NVIDIA_API_KEY/);
  });
});
test("request validation and remote browser origin checks reject invalid requests", async () => {
  await withApp(config, async (url) => {
    const invalid = await fetch(url + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(invalid.status, 400);
    const remote = await fetch(url + "/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
      },
      body: JSON.stringify(body),
    });
    assert.equal(remote.status, 403);
  });
});
test("NVIDIA request keeps key server-side, streams content, and omits reasoning", async () => {
  let requested: { url?: string; data?: any; headers?: HeadersInit } = {};
  const fetcher = (async (url, init) => {
    requested = {
      url: String(url),
      data: JSON.parse(String(init?.body)),
      headers: init?.headers,
    };
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"reasoning_content":"private thought"}}]}\n\ndata: {"choices":[{"delta":{"content":"Attention ',
            ),
          );
          controller.enqueue(
            encoder.encode('is finite. [1]"}}]}\n\ndata: [DONE]\n\n'),
          );
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }) as typeof fetch;
  await withApp(
    { ...config, apiKey: "test-secret" },
    async (url) => {
      const response = await fetch(url + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.match(text, /event: sources/);
      assert.match(text, /Attention is finite/);
      assert.match(text, /event: done/);
      assert.doesNotMatch(text, /private thought|test-secret/);
      assert.equal(requested.url, config.baseUrl + "/chat/completions");
      assert.equal(
        new Headers(requested.headers).get("authorization"),
        "Bearer test-secret",
      );
      assert.equal(requested.data.chat_template_kwargs.enable_thinking, false);
      assert.match(requested.data.messages[0].content, /untrusted data/);
      assert.equal(requested.data.max_tokens, 4096); // Existing API clients retain detailed answers.
    },
    fetcher,
  );
});
test("answer detail changes response budget without changing the chosen model or citation contract", async () => {
  const requests: any[] = [];
  const fetcher = (async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(
      'data: {"choices":[{"delta":{"content":"Attention is finite. [1]"}}]}\n\ndata: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }) as typeof fetch;
  await withApp(
    { ...config, apiKey: "test-mode-key" },
    async (url) => {
      for (const answerMode of ["quick", "deep"]) {
        const response = await fetch(url + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, answerMode }),
        });
        assert.equal(response.status, 200);
        assert.match(await response.text(), /Attention is finite\. \[1\]/);
      }
      assert.equal(requests[0].model, config.model);
      assert.equal(requests[1].model, config.model);
      assert.equal(requests[0].max_tokens, 1024);
      assert.equal(requests[1].max_tokens, 4096);
      assert.match(requests[0].messages[0].content, /three short paragraphs/);
      assert.match(
        requests[1].messages[0].content,
        /detailed, structured explanation/,
      );
      for (const request of requests) {
        assert.equal(request.chat_template_kwargs.enable_thinking, false);
        assert.match(request.messages[0].content, /Cite only IDs that exist/);
      }
      const invalid = await fetch(url + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, answerMode: "unbounded" }),
      });
      assert.equal(invalid.status, 400);
      assert.equal(requests.length, 2);
    },
    fetcher,
  );
});
test("Nebius passage questions pin the selected page and omit stale history in both answer modes", async () => {
  const requests: any[] = [];
  const fetcher = (async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(
      'data: {"id":"real-format-id","choices":[{"delta":{"content":"Rank counts independent columns. [1]"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
  }) as typeof fetch;
  await withApp(
    {
      ...config,
      apiKey: "isolated-test-key",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/Nemotron-3_5-Lightning",
    },
    async (url) => {
      const request = {
        question: "Define the selected term in the context of this passage.",
        selection: { sourceId: "book", page: 53, quote: "Rank" },
        sources: [
          {
            id: "book",
            name: "Book.pdf",
            pages: Array.from({ length: 60 }, (_, index) =>
              index === 52
                ? "Rank\n The rank of A is the dimension of its column space: the number of linearly independent columns."
                : "Ranking unrelated web search results.",
            ),
          },
        ],
        history: [
          {
            role: "assistant",
            content: "Here's a thinking process: stale answer.",
          },
          { role: "user", content: "Explain search engine ranking" },
        ],
      };
      for (const answerMode of ["quick", "deep"]) {
        const response = await fetch(url + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...request, answerMode }),
        });
        assert.equal(response.status, 200);
        const output = await response.text();
        assert.match(output, /"page":53/);
        assert.match(output, /independent columns/);
        assert.doesNotMatch(output, /web search results/);
      }
      for (const sent of requests) {
        assert.equal(sent.chat_template_kwargs.enable_thinking, false);
        assert.equal(sent.messages.length, 2);
        assert.doesNotMatch(
          JSON.stringify(sent.messages),
          /stale answer|web search results|search engine ranking/,
        );
        assert.match(sent.messages[0].content, /dimension of its column space/);
        assert.match(sent.messages[1].content, /"quote":"Rank"/);
        assert.match(sent.messages[1].content, /inline reference \[1\]/);
        assert.match(sent.messages[0].content, /Every paragraph or bullet/);
        assert.equal(sent.model, "nvidia/Nemotron-3_5-Lightning");
      }
      for (const selection of [
        { ...request.selection, quote: "Invented" },
        { ...request.selection, page: 99 },
        { ...request.selection, sourceId: "not-shared" },
      ]) {
        const response = await fetch(url + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...request, selection }),
        });
        assert.equal(response.status, 422);
      }
      assert.equal(requests.length, 2);
    },
    fetcher,
  );
});
test("reasoning inside content is hidden and truncated outputs cannot complete", async () => {
  for (const finishReason of ["stop", "length"]) {
    const fetcher = (async () =>
      new Response(
        'data: {"choices":[{"delta":{"content":"<thi"}}]}\n\ndata: {"choices":[{"delta":{"content":"nk>private analysis</think>Attention is finite. [1]"}}]}\n\n' +
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`,
      )) as typeof fetch;
    await withApp(
      { ...config, apiKey: "isolated-test-key" },
      async (url) => {
        const response = await fetch(url + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const output = await response.text();
        assert.doesNotMatch(output, /private analysis|think>/);
        assert.match(output, /Attention is finite/);
        if (finishReason === "length") {
          assert.match(output, /event: error/);
          assert.doesNotMatch(output, /event: done/);
        } else assert.match(output, /event: done/);
      },
      fetcher,
    );
  }
});
test("local NIM can run without a key and empty scans do not trigger inference", async () => {
  await withApp(
    { ...config, baseUrl: "http://127.0.0.1:8000/v1" },
    async (url) => {
      assert.equal(
        (await (await fetch(url + "/api/status")).json()).configured,
        true,
      );
      const response = await fetch(url + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          sources: [{ id: "scan", name: "scan.pdf", pages: [""] }],
        }),
      });
      assert.equal(response.status, 422);
    },
  );
});
test("provider auth and network failures give useful errors without secrets", async () => {
  for (const [fetcher, expected] of [
    [async () => new Response("", { status: 401 }), /rejected the API key/],
    [
      async () => {
        throw new Error("private network detail");
      },
      /Could not reach/,
    ],
  ] as const) {
    await withApp(
      { ...config, apiKey: "hidden" },
      async (url) => {
        const response = await fetch(url + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 502);
        assert.match((await response.json()).error, expected);
      },
      fetcher as typeof fetch,
    );
  }
});
