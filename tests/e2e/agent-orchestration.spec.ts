import { test, expect } from "@playwright/test";
import express from "express";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { createApp } from "../../server/app.ts";
import { TraceStore } from "../../server/trace-store.ts";
import type { AgentRun } from "../../src/agent-types.ts";
import { citationIssues } from "../../src/lib/citations.ts";

test("notebook assistant delegates scoped research and keeps its activity and traces after reload", async ({
  browser,
}) => {
  test.setTimeout(90000);
  mkdirSync("output/verification", { recursive: true });
  const directory = mkdtempSync(path.resolve("output/orchestration-fixture-"));
  const spool = path.join(directory, "trace.jsonl");
  const sourceURL = "https://93.184.216.34/attention-paper";
  const searchQuery = "attention mechanisms research papers";
  let releaseWeb: (() => void) | undefined;
  const webGate = new Promise<void>((resolve) => {
    releaseWeb = resolve;
  });
  let modelCalls = 0;
  const modelRequests: {
    role: string;
    instructions: string;
    tools: string[];
  }[] = [];
  const toolCall = (name: string, args: unknown) => ({
    content: null,
    tool_calls: [
      {
        id: randomUUID(),
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  const app = createApp(
    {
      apiKey: "fixture-model-key",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: "nvidia/test-nemotron",
    },
    (async (target, init) => {
      if (String(target).endsWith("/search"))
        return Response.json({
          results: [
            {
              url: sourceURL,
              title: "Attention research paper (fixture)",
              content: "A synthetic paper about attention for UI verification.",
            },
          ],
        });
      if (String(target).endsWith("/extract"))
        return Response.json({
          results: [
            {
              url: sourceURL,
              raw_content:
                "Attention assigns different weights to input tokens. This synthetic public page discusses how contextual information changes those weights.",
            },
          ],
        });
      expect(String(target)).toMatch(/\/chat\/completions$/);
      modelCalls++;
      const body = JSON.parse(String(init?.body));
      const system = body.messages
        .filter((message: any) => message.role === "system")
        .map((message: any) => message.content)
        .join("\n");
      const results = body.messages
        .filter((message: any) => message.role === "tool")
        .map((message: any) => JSON.parse(message.content));
      const role = system.includes("read-only public web researcher")
        ? "web"
        : system.includes("read-only notebook researcher")
          ? "notebook"
          : "main";
      const tools = body.tools.map((tool: any) => tool.function.name);
      modelRequests.push({ role, instructions: system, tools });
      let message;
      if (role === "main") {
        message = results.length
          ? {
              content: `The notebook and the public paper both describe attention as weighting information according to context. [${results[0].agents
                .flatMap((agent: any) =>
                  agent.citations.map((citation: any) => citation.id),
                )
                .join(", ")}]`,
            }
          : toolCall("delegate_agents", {
              agents: [
                {
                  name: "Notebook researcher",
                  kind: "researcher",
                  instructions:
                    "Read the selected attention brief and explain its central claim.",
                },
                {
                  name: "Web researcher",
                  kind: "web_researcher",
                  instructions:
                    "Search for a relevant attention paper and read the returned public page.",
                },
              ],
            });
      } else if (role === "notebook") {
        expect(tools).not.toContain("delegate_agents");
        expect(tools).not.toContain("search_web");
        message = results.length
          ? {
              content: `The selected brief says attention uses contextual weights. [${results[0].citation.id}]`,
            }
          : toolCall("read_file", {
              fileId: app.locals.agent.data.state.tasks[0].fileIds[0],
            });
      } else {
        expect(tools.sort()).toEqual(["read_web", "search_web"]);
        if (!results.length)
          message = toolCall("search_web", { query: searchQuery });
        else if (results.length === 1)
          message = toolCall("read_web", { url: sourceURL });
        else {
          await webGate;
          message = {
            content: `The public paper describes attention weights that change with context. [${results[1].id}]`,
          };
        }
      }
      return Response.json({
        id: `fixture-orchestration-${modelCalls}`,
        model: body.model,
        choices: [{ message }],
        usage: { prompt_tokens: 40, completion_tokens: 20 },
      });
    }) as typeof fetch,
    {
      agentFile: path.join(directory, "agent.json"),
      workspaceFile: path.join(directory, "workspace.json"),
      traceSpoolFile: spool,
    },
  );
  await app.locals.workspace.ready;
  app.use(express.static(path.resolve("dist")));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const post = async (endpoint: string, body: unknown) => {
    const response = await fetch(api + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    expect(response.ok, `Fixture setup ${endpoint}: ${text}`).toBe(true);
    return JSON.parse(text);
  };
  try {
    await post("/api/agent/workspace/web-connection", {
      provider: "tavily",
      apiKey: "fixture-search-key",
    });
    await post("/api/agent/workspace/web-connection/test", {});
    await page.goto(api + "/app");
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page
      .getByRole("button", { name: "Expand Agent to full screen", exact: true })
      .click();
    const composer = page.getByRole("form", { name: "New agent task" });
    await expect(composer).toBeVisible();
    await composer
      .getByLabel("What should I do?", { exact: true })
      .fill(
        "Compare the selected attention brief with a relevant public research paper. Delegate source reading and web research, then combine their cited findings.",
      );
    await composer
      .getByLabel("Agent instructions", { exact: true })
      .fill("Explain clearly and distinguish agreement from uncertainty.");
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("button", { name: "Research", exact: true }).click();
    await expect(
      composer.getByLabel("Agent instructions", { exact: true }),
    ).toHaveValue(
      "Explain clearly and distinguish agreement from uncertainty.",
    );
    await composer
      .getByRole("button", { name: "Automatic team", exact: true })
      .click();
    await composer
      .getByText("Specialist instructions", { exact: true })
      .click();
    await composer
      .getByLabel("Notebook researcher", { exact: true })
      .fill("Focus on definitions in the selected brief.");
    await composer
      .getByLabel("Web researcher", { exact: true })
      .fill("Prefer research papers and read the source before citing it.");
    await composer
      .getByLabel("Allow public web search and page reading")
      .check();
    await composer.getByText("Task settings", { exact: true }).click();
    await composer
      .getByLabel("Task name", { exact: true })
      .fill("Compare attention research");
    await composer
      .getByLabel("Reusable skill", { exact: true })
      .selectOption("autonomous-tools");
    await composer.getByText("Task settings", { exact: true }).click();
    await composer.getByText("Sources & files", { exact: true }).click();
    await composer
      .getByLabel("Add a text file", { exact: true })
      .setInputFiles({
        name: "attention-brief.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "Synthetic notebook brief. Attention uses contextual weights to combine input information.",
        ),
      });
    await expect(
      composer.getByLabel("attention-brief.md · uploaded file"),
    ).toBeChecked();
    await composer.getByText("Sources & files", { exact: true }).click();
    await composer
      .getByRole("button", { name: "Start research", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Inspect Compare attention research",
        exact: true,
      })
      .click();
    const timeline = page.getByRole("region", { name: "Agent work timeline" });
    await expect(
      timeline.locator('[data-agent-kind="web_researcher"]'),
    ).toContainText("Web researcher", { timeout: 20000 });
    const search = timeline.locator('[data-action="search_web"]');
    await expect(search).toContainText("Searched the web", { timeout: 15000 });
    await search.locator("summary").first().click();
    await expect(search).toContainText(searchQuery);
    await expect(
      search.getByRole("link", { name: "Attention research paper (fixture)" }),
    ).toBeVisible();
    await expect(
      timeline.locator('[data-agent-kind="researcher"]'),
    ).toContainText("Notebook researcher");
    await timeline.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "output/verification/agent-workspace-desktop.png",
      fullPage: true,
    });
    releaseWeb!();
    await expect
      .poll(() => app.locals.agent.data.state.runs[0]?.status, {
        timeout: 20000,
      })
      .toBe("completed");
    const run: AgentRun = app.locals.agent.data.state.runs[0];
    expect(run.agents).toHaveLength(2);
    expect(run.agents?.every((agent) => agent.status === "completed")).toBe(
      true,
    );
    expect(run.citations).toHaveLength(2);
    expect(citationIssues(run.answer, run.citations)).toEqual([]);
    expect(modelCalls).toBe(7);
    expect(
      modelRequests.find((request) => request.role === "main")?.instructions,
    ).toContain("Explain clearly and distinguish agreement from uncertainty.");
    expect(
      modelRequests.find((request) => request.role === "notebook")
        ?.instructions,
    ).toContain("Focus on definitions in the selected brief.");
    expect(
      modelRequests.find((request) => request.role === "web")?.instructions,
    ).toContain("Prefer research papers and read the source before citing it.");
    const trace = await app.locals.traceStore.detail(
      run.notebookId,
      run.traceId!,
    );
    const specialists = trace.spans.filter(
      (span: any) => span.kind === "agent" && span.attributes.agentId,
    );
    expect(specialists).toHaveLength(2);
    expect(
      specialists.every(
        (span: any) => span.parentSpanId && span.status === "completed",
      ),
    ).toBe(true);
    const persisted = new TraceStore(undefined, spool);
    try {
      const saved = await persisted.detail(run.notebookId, run.traceId!);
      expect(
        saved?.spans.filter(
          (span) => span.kind === "agent" && span.attributes.agentId,
        ),
      ).toHaveLength(2);
    } finally {
      await persisted.close();
    }
    expect(readFileSync(spool, "utf8")).not.toContain("fixture-model-key");
    expect(readFileSync(spool, "utf8")).not.toContain("fixture-search-key");
    const foreign = await fetch(
      `${api}/api/agent/workspace/another-notebook/traces/${run.traceId}`,
    );
    expect(foreign.status).toBe(404);
    const foreignDashboard = await fetch(
      `${api}/api/agent/workspace/another-notebook/dashboard`,
    ).then((response) => response.json());
    expect(foreignDashboard.traces).toEqual([]);
    await expect(page.locator(".agent-result .markdown")).toContainText(
      "both describe attention",
    );
    await page
      .getByRole("button", { name: "Save report to Notes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Saved to Notes", exact: true }),
    ).toBeDisabled();
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download activity log", exact: true })
      .click();
    const downloaded = await downloadEvent;
    const traceFile = path.join(directory, "exported-trace.json");
    await downloaded.saveAs(traceFile);
    expect(readFileSync(traceFile, "utf8")).toContain("agent.completed");
    await page.reload();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Inspect Compare attention research",
        exact: true,
      })
      .click();
    const savedTimeline = page.getByRole("region", {
      name: "Agent work timeline",
    });
    await expect(
      page.getByRole("button", { name: "Saved to Notes", exact: true }),
    ).toBeDisabled();
    await expect(savedTimeline).toContainText("Notebook researcher");
    await expect(savedTimeline).toContainText("Read a web page");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await savedTimeline.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "output/verification/agent-workspace-mobile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    releaseWeb?.();
    await context.close();
    app.locals.agent.stop();
    app.locals.workspace.worker.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.locals.traceStore.close();
    await app.locals.workspace.repository.close();
  }
});
