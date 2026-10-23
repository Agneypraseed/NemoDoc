import { test, expect } from "./fixtures";
import { createApp } from "../../server/app.ts";
import type { Page } from "@playwright/test";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

async function setup(page: Page) {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-search-ui-"));
  const requests: { url: string; key: string }[] = [];
  const pageURL = "https://93.184.216.34/research";
  const app = createApp(
    {
      baseUrl: "https://model.example.test/v1",
      model: "nvidia/test-nemotron",
      apiKey: "",
    },
    async (url, init) => {
      const endpoint = String(url);
      const headers = new Headers(init?.headers);
      const key =
        headers.get("x-api-key") || headers.get("authorization") || "";
      requests.push({ url: endpoint, key });
      if (key.includes("invalid"))
        return new Response("private provider response", { status: 401 });
      if (endpoint.endsWith("/search")) {
        const results = [{ url: pageURL, title: "Search setup fixture" }];
        return Response.json(
          endpoint.includes("firecrawl")
            ? { success: true, data: { web: results } }
            : { results },
        );
      }
      if (endpoint.endsWith("/extract"))
        return Response.json({
          results: [{ url: pageURL, raw_content: "A readable page." }],
        });
      if (endpoint.endsWith("/contents"))
        return Response.json({
          results: [{ url: pageURL, text: "A readable page." }],
        });
      if (endpoint.endsWith("/scrape"))
        return Response.json({
          success: true,
          data: {
            markdown: "A readable page.",
            metadata: { sourceURL: pageURL },
          },
        });
      throw new Error("Unexpected inference request");
    },
    { workspaceFile: path.join(directory, "workspace.json") },
  );
  await app.locals.workspace.ready;
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await page.route("**/api/agent/workspace/web-connection**", async (route) => {
    const request = route.request();
    const response = await fetch(base + new URL(request.url()).pathname, {
      method: request.method(),
      headers: { "Content-Type": "application/json" },
      body: request.postData() || undefined,
    });
    const body = await response.text();
    expect(body).not.toContain("fixture-key");
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body,
    });
  });
  return {
    requests,
    close: async () => {
      app.locals.agent.stop();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await app.locals.workspace.repository.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
async function openSearch(page: Page) {
  await page.goto("/app");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  return dialog.getByRole("region", { name: "Web research connection" });
}

test("Settings connect each search provider, recover from an invalid key, and reuse separate saved keys", async ({
  page,
}) => {
  const h = await setup(page);
  try {
    const search = await openSearch(page);
    const connect = search.getByRole("button", {
      name: "Save & test search",
      exact: true,
    });
    await expect(connect).toBeDisabled();
    for (const [provider, name] of [
      ["tavily", "Tavily"],
      ["exa", "Exa"],
      ["firecrawl", "Firecrawl"],
    ]) {
      await search.getByLabel("Search provider").selectOption(provider);
      await expect(search.getByLabel("Search API key")).toHaveValue("");
      await search.getByLabel("Search API key").fill(`${provider}-fixture-key`);
      await connect.click();
      await expect(search.getByRole("status")).toHaveText(`${name} connected.`);
    }
    expect(h.requests).toHaveLength(6);
    expect(h.requests.map((request) => request.key)).toEqual([
      "Bearer tavily-fixture-key",
      "Bearer tavily-fixture-key",
      "exa-fixture-key",
      "exa-fixture-key",
      "Bearer firecrawl-fixture-key",
      "Bearer firecrawl-fixture-key",
    ]);
    await search.getByLabel("Search provider").selectOption("exa");
    await search.getByLabel("Search API key").fill("invalid-fixture-key");
    await connect.click();
    await expect(search.getByRole("alert")).toContainText("Check your API key");
    await expect(search.getByRole("status")).toHaveCount(0);
    await search.getByLabel("Search API key").fill("exa-fixture-key");
    await connect.click();
    await expect(search.getByRole("status")).toHaveText("Exa connected.");
    await search.getByLabel("Search provider").selectOption("tavily");
    await expect(search.getByLabel("Search API key")).toHaveValue("");
    await connect.click();
    await expect(search.getByRole("status")).toHaveText("Tavily connected.");
    expect(h.requests.at(-1)?.key).toBe("Bearer tavily-fixture-key");
    await page.screenshot({ path: "output/search-settings-desktop.png" });
    const restored = await openSearch(page);
    await expect(restored.getByLabel("Search provider")).toHaveValue("tavily");
    await expect(restored.getByLabel("Search API key")).toHaveAttribute(
      "placeholder",
      /Key saved/,
    );
    await restored
      .getByRole("button", { name: "Disconnect search", exact: true })
      .click();
    await expect(restored.getByRole("status")).toHaveText(
      "Tavily disconnected.",
    );
    await expect(
      restored.getByRole("button", { name: "Save & test search", exact: true }),
    ).toBeDisabled();
  } finally {
    await h.close();
  }
});

test("search setup fits a small screen and verifies a provider with one action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const h = await setup(page);
  try {
    const search = await openSearch(page);
    await search.getByLabel("Search provider").selectOption("exa");
    await search.getByLabel("Search API key").fill("exa-fixture-key");
    await search
      .getByRole("button", { name: "Save & test search", exact: true })
      .click();
    await expect(search.getByRole("status")).toHaveText("Exa connected.");
    expect(h.requests).toHaveLength(2);
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "output/search-settings-mobile.png" });
  } finally {
    await h.close();
  }
});

test("search settings stay synchronized with agent connections", async ({
  page,
}) => {
  const h = await setup(page);
  try {
    await page.goto("/app");
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page
      .getByLabel("Agent sections", { exact: true })
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    const inline = page.getByRole("region", {
      name: "Web research connection",
    });
    await expect(inline.getByLabel("Search provider")).toHaveValue("tavily");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    const search = dialog.getByRole("region", {
      name: "Web research connection",
    });
    await search.getByLabel("Search provider").selectOption("exa");
    await search.getByLabel("Search API key").fill("exa-fixture-key");
    await search
      .getByRole("button", { name: "Save & test search", exact: true })
      .click();
    await expect(search.getByRole("status")).toHaveText("Exa connected.");
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(inline.getByLabel("Search provider")).toHaveValue("exa");
    await expect(inline.getByRole("status")).toHaveText("Exa connected.");
  } finally {
    await h.close();
  }
});
