import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WebResearch } from "../server/workspace/web-research.ts";
import { webProvider, type WebProvider } from "../src/web-research-types.ts";

const url = "https://93.184.216.34/research";
const text = "Page evidence. ".repeat(1000);
function fixture() {
  const requests: { url: string; headers: Headers; body: any }[] = [];
  const state = { status: 200, failRead: false, unsafe: false };
  const fetcher: typeof fetch = async (input, init) => {
    const endpoint = String(input);
    requests.push({
      url: endpoint,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    if (state.status !== 200)
      return new Response("provider body contains private-key", {
        status: state.status,
      });
    if (endpoint.endsWith("/search")) {
      const results = [
        {
          url: state.unsafe ? "http://127.0.0.1/private" : url,
          title: "Research page",
          content: "A snippet must never be cited",
          publishedDate: "2026-10-01",
        },
      ];
      return Response.json(
        endpoint.includes("firecrawl")
          ? { success: true, data: { web: results } }
          : { results },
      );
    }
    if (endpoint.endsWith("/extract"))
      return Response.json({
        results: state.failRead ? [] : [{ url, raw_content: text }],
      });
    if (endpoint.endsWith("/contents"))
      return Response.json({ results: state.failRead ? [] : [{ url, text }] });
    if (endpoint.endsWith("/scrape"))
      return Response.json({
        success: true,
        data: {
          markdown: state.failRead ? "" : text,
          metadata: { sourceURL: url },
        },
      });
    throw new Error("Unexpected request");
  };
  return { requests, state, fetcher };
}

for (const provider of webProvider.options) {
  test(`${provider} searches and extracts a page using its native API`, async () => {
    const f = fixture();
    const web = new WebResearch(undefined, f.fetcher);
    web.save({ provider, apiKey: "private-key" });
    const result = await web.test();
    assert.equal(result.provider, provider);
    assert.equal(result.tested, true);
    assert.equal(f.requests.length, 2);
    const [search, read] = f.requests;
    const host = {
      tavily: "api.tavily.com",
      exa: "api.exa.ai",
      firecrawl: "api.firecrawl.dev",
    }[provider];
    assert.equal(
      search.url,
      `https://${host}/${provider === "firecrawl" ? "v2/search" : "search"}`,
    );
    assert.equal(
      read.url,
      `https://${host}/${provider === "firecrawl" ? "v2/scrape" : provider === "exa" ? "contents" : "extract"}`,
    );
    assert.equal(
      search.headers.get(provider === "exa" ? "x-api-key" : "authorization"),
      provider === "exa" ? "private-key" : "Bearer private-key",
    );
    assert.deepEqual(
      search.body,
      provider === "exa"
        ? { query: "NVIDIA research", numResults: 5, type: "auto" }
        : provider === "firecrawl"
          ? { query: "NVIDIA research", limit: 5, sources: [{ type: "web" }] }
          : {
              query: "NVIDIA research",
              max_results: 5,
              search_depth: "basic",
              include_answer: false,
              include_raw_content: false,
            },
    );
    assert.deepEqual(
      read.body,
      provider === "exa"
        ? { urls: [url], text: true }
        : provider === "firecrawl"
          ? { url, formats: ["markdown"], onlyMainContent: true }
          : {
              urls: [url],
              extract_depth: "basic",
              format: "text",
              include_images: false,
            },
    );
    const candidates = await web.search(
      "Research question",
      AbortSignal.timeout(1000),
    );
    assert.deepEqual(candidates, [
      { url, title: "Research page", publishedAt: "2026-10-01" },
    ]);
    const page = await web.read(candidates[0], AbortSignal.timeout(1000));
    assert.equal(page.text, text.slice(0, 12000));
    assert.ok(!JSON.stringify(web.public()).includes("private-key"));
    f.state.failRead = true;
    await assert.rejects(web.test(), /could not be extracted/);
    assert.equal(web.public().tested, false);
    f.state.failRead = false;
    f.state.unsafe = true;
    const before = f.requests.length;
    await assert.rejects(web.test(), /no readable public results/);
    assert.equal(f.requests.length - before, 1);
  });
}

test("legacy Tavily settings migrate; keys survive provider switches without crossing providers", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-search-"));
  const filename = path.join(directory, "web.json");
  const f = fixture();
  try {
    writeFileSync(
      filename,
      JSON.stringify({ apiKey: "old-tavily", tested: true, revision: "old" }),
    );
    let web = new WebResearch(filename, f.fetcher);
    assert.equal(web.public().provider, "tavily");
    assert.equal(web.public().tested, true);
    web.save({ provider: "exa" });
    assert.equal(web.public().hasApiKey, false);
    await assert.rejects(web.test(), /Exa API key is required/);
    assert.equal(f.requests.length, 0);
    web.save({ provider: "exa", apiKey: "exa-key" });
    await web.test();
    web.save({ provider: "firecrawl", apiKey: "firecrawl-key" });
    web.save({ provider: "tavily" });
    assert.equal(web.value.apiKey, "old-tavily");
    web = new WebResearch(filename, f.fetcher);
    web.save({ provider: "exa" });
    assert.equal(web.value.apiKey, "exa-key");
    await web.test();
    const revision = web.value.revision;
    web.save({ provider: "firecrawl", clearApiKey: true });
    assert.equal(web.value.provider, "exa");
    assert.equal(web.value.revision, revision);
    assert.equal(web.value.tested, true);
    assert.deepEqual(web.secrets().sort(), ["exa-key", "old-tavily"]);
    assert.ok(!JSON.stringify(web.public()).includes("exa-key"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const [status, message] of [
  [401, "Check your API key"],
  [402, "Add credits"],
  [429, "Rate limit"],
] as const) {
  test(`provider HTTP ${status} gives actionable feedback without exposing its response`, async () => {
    const f = fixture();
    f.state.status = status;
    const web = new WebResearch(undefined, f.fetcher);
    web.save({ provider: "exa", apiKey: "private-key" });
    await assert.rejects(
      web.test(),
      (error: Error) =>
        error.message.includes(message) &&
        !error.message.includes("private-key"),
    );
    assert.equal(web.public().tested, false);
  });
}

test("a provider change during verification cannot mark the new provider connected", async () => {
  const f = fixture();
  let release!: () => void;
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  const web = new WebResearch(undefined, async (input, init) => {
    await pause;
    return f.fetcher(input, init);
  });
  web.save({ provider: "tavily", apiKey: "tavily-key" });
  const verification = web.test();
  web.save({ provider: "exa", apiKey: "exa-key" });
  release();
  await assert.rejects(verification, /connection changed/i);
  assert.equal(web.public().provider, "exa");
  assert.equal(web.public().tested, false);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].headers.get("authorization"), "Bearer tavily-key");
});
