import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.ts";
import { SettingsStore } from "../server/settings.ts";
import { SemanticRetriever } from "../server/semantic.ts";

const config = {
  apiKey: "test-secret",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  model: "nvidia/test",
};
const sources = [
  {
    id: "a",
    name: "Attention.pdf",
    pages: ["Human concentration is a limited cognitive resource."],
  },
  { id: "b", name: "Gardening.pdf", pages: ["Trees grow roots in the soil."] },
];
const reply = (content: string) =>
  Response.json({ choices: [{ message: { content } }] });
async function withApp(
  fetcher: typeof fetch,
  run: (url: string) => Promise<void>,
  settingsFile?: string,
  appConfig = config,
) {
  const server = createApp(appConfig, fetcher, { settingsFile }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((r) => server.once("listening", r));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
}
const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("Nebius environment defaults use Nebius capability models and keep reranking opt-in", () => {
  const store = new SettingsStore({
    apiKey: "test-secret",
    baseUrl: "https://api.tokenfactory.nebius.com/v1",
    model: "nvidia/Nemotron-3_5-Lightning",
  });
  assert.equal(store.value.embeddingModel, "Qwen/Qwen3-Embedding-8B");
  assert.equal(store.value.visionModel, "openbmb/MiniCPM-V-4_5");
  assert.equal(store.value.visionBaseUrl, store.value.baseUrl);
  assert.equal(store.value.rerank, false);
  assert.equal(store.value.semantic, false);
  assert.equal(store.public().hasApiKey, true);
  assert.equal((store.public() as any).apiKey, undefined);
});

test("settings keep credentials server-side, preserve or clear keys, persist, and test the chosen model", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-settings-")),
    filename = path.join(directory, "settings.json");
  let requests: any[] = [];
  try {
    await withApp(
      (async (_url, init) => {
        requests.push({
          body: JSON.parse(String(init?.body)),
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return reply("ready");
      }) as typeof fetch,
      async (url) => {
        const settings = await (await fetch(url + "/api/settings")).json();
        assert.equal(settings.hasApiKey, true);
        assert.equal(settings.apiKey, undefined);
        const save = await post(url + "/api/settings", {
          ...settings,
          baseUrl: "http://127.0.0.1:8000/v1",
          model: "local-nemotron",
          apiKey: "replacement-key",
        });
        assert.equal(save.status, 200);
        assert.doesNotMatch(await save.text(), /replacement-key/);
        assert.equal((await post(url + "/api/settings/test", {})).status, 200);
        assert.equal(requests[0].body.model, "local-nemotron");
        assert.equal(requests[0].authorization, "Bearer replacement-key");
        const localSettings = await (await fetch(url + "/api/settings")).json();
        await post(url + "/api/settings", { ...localSettings, apiKey: "" });
        assert.equal(
          JSON.parse(readFileSync(filename, "utf8")).apiKey,
          "replacement-key",
        );
        await post(url + "/api/settings", { ...settings, apiKey: "" });
        assert.equal(
          (await (await fetch(url + "/api/settings")).json()).hasApiKey,
          false,
          "A changed host must not receive the previous provider key",
        );
        await post(url + "/api/settings", { ...settings, clearApiKey: true });
        assert.equal(
          (await (await fetch(url + "/api/settings")).json()).hasApiKey,
          false,
        );
        assert.equal(new SettingsStore(config, filename).value.apiKey, "");
        assert.equal(
          (
            await post(url + "/api/settings", {
              ...settings,
              baseUrl: "http://public.example.com/v1",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await post(url + "/api/settings", {
              ...settings,
              baseUrl: "https://user:password@example.com/v1",
            })
          ).status,
          400,
        );
      },
      filename,
    );
    writeFileSync(filename, "broken json");
    assert.doesNotThrow(() => new SettingsStore(config, filename));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("semantic retrieval finds related language, caches passages, uses query/passages modes, and reranks", async () => {
  const calls: any[] = [];
  const fetcher = (async (url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url, body });
    if (String(url).includes("reranking"))
      return Response.json({
        rankings: [
          { index: 1, logit: 3 },
          { index: 0, logit: 1 },
        ],
      });
    return Response.json({
      data: body.input.map((text: string, index: number) => ({
        index,
        embedding: /Trees|soil/.test(text) ? [0, 1] : [1, 0],
      })),
    });
  }) as typeof fetch;
  const retriever = new SemanticRetriever(fetcher),
    settings = { ...new SettingsStore(config).value, semantic: true };
  const result = await retriever.search(
    sources,
    "How can I preserve my focus?",
    settings,
  );
  assert.equal(result.citations[0].sourceId, "a");
  assert.equal(result.citations[0].page, 1);
  assert.equal(calls[0].body.input_type, "passage");
  assert.equal(calls[1].body.input_type, "query");
  await retriever.search(sources, "Another question", settings);
  assert.equal(calls.filter((c) => c.body.input_type === "passage").length, 1);
  const reranked = await retriever.search(sources, "Another question", {
    ...settings,
    rerank: true,
  });
  assert.equal(reranked.citations[0].sourceId, "b");
  assert.equal(reranked.mode, "semantic + rerank");
  assert.deepEqual(calls.at(-1).body.query, { text: "Another question" });
  assert.equal(typeof calls.at(-1).body.passages[0].text, "string");
  const invalid = new SemanticRetriever((async () =>
    Response.json({
      data: [
        { index: 0, embedding: [1, 0] },
        { index: 0, embedding: [0, 1] },
      ],
    })) as typeof fetch);
  await assert.rejects(invalid.search(sources, "q", settings), /duplicate/);
});

test("vision uses NVIDIA image_url content and OCR validates normalized regions and readable text", async () => {
  let request: any,
    content = "The bar chart shows a rising trend.";
  await withApp(
    (async (_url, init) => {
      request = JSON.parse(String(init?.body));
      return reply(content);
    }) as typeof fetch,
    async (url) => {
      const image = "data:image/png;base64,aGVsbG8=";
      const result = await post(url + "/api/vision", {
        image,
        question: "Describe the chart",
      });
      assert.equal(result.status, 200);
      assert.match((await result.json()).content, /rising/);
      assert.equal(request.model, "nvidia/nemotron-nano-12b-v2-vl");
      assert.deepEqual(request.messages[1].content[1], {
        type: "image_url",
        image_url: { url: image },
      });
      content = JSON.stringify({
        text: "Heading\n| Year | Total |\n| 2026 | 42 |",
        regions: [
          { text: "Heading", x: 0.1, y: 0.1, width: 0.8, height: 0.05 },
        ],
      });
      const ocr = await post(url + "/api/ocr", { image });
      assert.equal(ocr.status, 200);
      assert.equal((await ocr.json()).regions[0].x, 0.1);
      content = JSON.stringify({ text: "", regions: [] });
      assert.equal((await post(url + "/api/ocr", { image })).status, 502);
      assert.equal(
        (
          await post(url + "/api/vision", {
            image: "https://example.com/chart.png",
            question: "Chart?",
          })
        ).status,
        400,
      );
    },
  );
});

test("study tools retain valid citations, reject invented sources and invalid quiz or mind map structure", async () => {
  let artifact: any = {
    title: "Study cards",
    content: "",
    items: Array.from({ length: 3 }, (_, i) => ({
      question: `Question ${i}`,
      answer: "Attention is finite.",
      citationIds: [1],
    })),
  };
  await withApp(
    (async () =>
      reply("```json\n" + JSON.stringify(artifact) + "\n```")) as typeof fetch,
    async (url) => {
      const good = await post(url + "/api/study", {
        kind: "flashcards",
        sources,
      });
      assert.equal(good.status, 200);
      assert.equal((await good.json()).citations[0].sourceId, "a");
      artifact.items[0].citationIds = [999];
      assert.equal(
        (await post(url + "/api/study", { kind: "flashcards", sources }))
          .status,
        502,
      );
      artifact.items[0].citationIds = [1];
      artifact.items = artifact.items.map((item: any) => ({
        ...item,
        choices: ["a", "b"],
        correct: 2,
      }));
      assert.equal(
        (await post(url + "/api/study", { kind: "quiz", sources })).status,
        502,
      );
      artifact.items.forEach((item: any) => (item.correct = 0));
      assert.equal(
        (await post(url + "/api/study", { kind: "quiz", sources })).status,
        200,
      );
      artifact = {
        title: "Guide",
        content: "## Attention\nLimited resource [999].",
        items: [],
      };
      assert.equal(
        (await post(url + "/api/study", { kind: "guide", sources })).status,
        502,
      );
      artifact.content = "## Attention\nLimited resource [1].";
      assert.equal(
        (await post(url + "/api/study", { kind: "guide", sources })).status,
        200,
      );
      artifact = {
        title: "Map",
        content: "",
        items: [],
        nodes: [
          { id: "root", label: "Root", citationIds: [1] },
          { id: "a", label: "A", parentId: "root", citationIds: [1] },
          { id: "b", label: "B", parentId: "a", citationIds: [1] },
        ],
      };
      assert.equal(
        (await post(url + "/api/study", { kind: "mindmap", sources })).status,
        200,
      );
      artifact.nodes[1].parentId = "b";
      assert.equal(
        (await post(url + "/api/study", { kind: "mindmap", sources })).status,
        502,
      );
    },
  );
});
test("Nebius study requests constrain output shape and classify malformed model output as a provider error", async () => {
  let malformed = false;
  await withApp(
    (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.response_format.type, "json_schema");
      const itemSchema =
        body.response_format.json_schema.schema.properties.items;
      assert.equal(itemSchema.minItems, 3);
      assert.ok(itemSchema.items.required.includes("citationIds"));
      assert.ok(itemSchema.items.required.includes("choices"));
      assert.ok(itemSchema.items.required.includes("correct"));
      return reply(
        JSON.stringify({
          title: "Quiz",
          content: "",
          items: Array.from({ length: 3 }, () => ({
            question: "What is finite?",
            answer: "Attention.",
            choices: ["Attention", "Time"],
            correct: 0,
            ...(malformed ? { citationId: 1 } : { citationIds: [1] }),
          })),
        }),
      );
    }) as typeof fetch,
    async (url) => {
      assert.equal(
        (await post(url + "/api/study", { kind: "quiz", sources })).status,
        200,
      );
      malformed = true;
      const failure = await post(url + "/api/study", { kind: "quiz", sources });
      assert.equal(failure.status, 502);
      assert.match(
        (await failure.json()).error,
        /model returned invalid study/,
      );
      assert.equal(
        (await post(url + "/api/study", { kind: "invalid", sources })).status,
        400,
      );
    },
    undefined,
    { ...config, baseUrl: "https://api.tokenfactory.nebius.com/v1" },
  );
});

test("chat reports semantic fallback and continues with grounded keyword excerpts", async () => {
  await withApp(
    (async (url) =>
      String(url).endsWith("/embeddings")
        ? new Response("", { status: 503 })
        : new Response(
            'data: {"choices":[{"delta":{"content":"Attention is finite [1]."}}]}\n\ndata: [DONE]\n\n',
            { headers: { "Content-Type": "text/event-stream" } },
          )) as typeof fetch,
    async (url) => {
      const settings = await (await fetch(url + "/api/settings")).json();
      await post(url + "/api/settings", { ...settings, semantic: true });
      const response = await post(url + "/api/chat", {
        question: "Explain attention",
        sources,
        history: [],
      });
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.match(body, /event: retrieval/);
      assert.match(body, /keyword matches/);
      assert.match(body, /Attention is finite/);
      assert.match(body, /"sourceId":"a"/);
    },
  );
});
