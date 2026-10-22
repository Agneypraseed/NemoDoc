import { test, expect } from "./fixtures";
import { createApp } from "../../server/app.ts";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { NemoClawReader } from "../../server/agent-monitor.ts";

const modelId = "nvidia/test-nemotron";
const webURL = "https://93.184.216.34/research";
const assignments = {
  agents: [
    {
      id: "definitions",
      name: "Definitions researcher",
      assignment: "Investigate definitions",
      role: "researcher",
    },
    {
      id: "comparisons",
      name: "Comparison researcher",
      assignment: "Compare methods",
      role: "researcher",
    },
    {
      id: "reviewer",
      name: "Reviewer",
      assignment: "Check evidence and limits",
      role: "reviewer",
    },
  ],
};
const roster = [
  { id: "foundations", name: "Foundations researcher", model: modelId },
  { id: "neural-networks", name: "Neural networks researcher", model: modelId },
  { id: "critical-review", name: "Critical reviewer", model: modelId },
];

function modelResponse(message: unknown) {
  return new Response(
    JSON.stringify({
      id: "fixture-response",
      model: modelId,
      choices: [{ message, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    }),
    {
      headers: {
        "content-type": "application/json",
        "x-request-id": "fixture-request",
      },
    },
  );
}

test("application research edits a plan, reads notebook and web evidence, and inspects durable traces", async ({
  browser,
}, testInfo) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-research-team-"));
  const pdfPath = path.join(directory, "synthetic-mml-pca.pdf");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(
    "SYNTHETIC MML FIXTURE. PCA selects principal directions from a covariance matrix. A linear autoencoder connection is a mathematical comparison only. This page cannot establish neural-network training, empirical performance, or generalization.",
    { x: 45, y: 720, size: 12, font, maxWidth: 500 },
  );
  writeFileSync(pdfPath, await pdf.save());

  const agentRows = roster.map((agent) => ({
    id: agent.id,
    name: agent.name,
    identity: { name: agent.name },
    model: { primary: modelId, fallbacks: [] },
  }));
  const nativeReader: NemoClawReader = async (args) => {
    if (args[1] === "agents" && args[2] === "list")
      return JSON.stringify(roster);
    if (args[1] === "exec" && args[6] === "sessions.list")
      return JSON.stringify({ sessions: [] });
    if (args[1] === "exec" && args[6] === "agents.list")
      return JSON.stringify({ agents: agentRows });
    if (args[1] === "exec" && args[6] === "models.list")
      return JSON.stringify({
        models: [
          {
            id: "test-nemotron",
            name: "Fixture NVIDIA model",
            provider: "nvidia",
            available: true,
            supportsTools: true,
          },
        ],
      });
    throw new Error("Unexpected native read in isolated browser fixture.");
  };

  const modelRequests: string[] = [];
  const firstTargets = new Set<string>();
  let releaseInference!: () => void;
  let reportInferenceStarted!: () => void;
  const release = new Promise<void>((resolve) => (releaseInference = resolve));
  const inferenceStarted = new Promise<void>(
    (resolve) => (reportInferenceStarted = resolve),
  );
  let selectedSourceId = "";
  let selectedNotebookId = "";
  const modelFetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(_url).includes("api.tavily.com/search"))
      return new Response(
        JSON.stringify({
          results: [
            {
              url: webURL,
              title: "Synthetic web research",
              content: "Unread search snippet",
            },
          ],
        }),
      );
    if (String(_url).includes("api.tavily.com/extract"))
      return new Response(
        JSON.stringify({
          results: [
            {
              url: webURL,
              raw_content:
                "SYNTHETIC WEB FIXTURE. This comparison does not establish empirical performance.",
            },
          ],
          failed_results: [],
        }),
      );
    const target = String(body.model);
    modelRequests.push(target);
    const system = String(body.messages[0]?.content ?? "");
    if (system.includes("Plan research assignments only"))
      return modelResponse({ content: JSON.stringify(assignments) });
    if (
      system.includes(
        "You are NemoDoc's critical reviewer and final synthesis author.",
      )
    ) {
      const input = JSON.parse(body.messages[1].content);
      const citation = input.evidence[0].id;
      return modelResponse({
        content: `The synthetic MML page describes PCA [${citation}]. The web comparison [${input.evidence.find((e: any) => e.url).id}] cannot establish how neural networks are trained or generalize.`,
      });
    }
    const toolMessages = body.messages.filter(
      (message: any) => message.role === "tool",
    );
    if (toolMessages.length === 2)
      return modelResponse({
        content: null,
        tool_calls: [
          {
            id: "web-read",
            type: "function",
            function: {
              name: "read_web_page",
              arguments: JSON.stringify({ url: webURL }),
            },
          },
        ],
      });
    if (toolMessages.length) {
      const output = JSON.parse(toolMessages[0].content);
      return modelResponse({
        content: `The selected PCA passage supports this finding [${output[0].id}].`,
      });
    }
    firstTargets.add(JSON.parse(body.messages[1].content).assignment);
    if (firstTargets.size === 2) reportInferenceStarted();
    await release;
    const agentId = target.split("/").at(-1);
    return modelResponse({
      content: null,
      tool_calls: [
        {
          id: `read-${agentId}`,
          type: "function",
          function: {
            name: "read_passage",
            arguments: JSON.stringify({ sourceId: selectedSourceId, page: 1 }),
          },
        },
        {
          id: "web-search",
          type: "function",
          function: {
            name: "search_web",
            arguments: JSON.stringify({ query: "PCA research" }),
          },
        },
      ],
    });
  };

  const app = createApp(
    {
      apiKey: "fixture-key",
      baseUrl: "https://api.example.test/v1",
      model: modelId,
    },
    modelFetcher,
    {
      workspaceFile: path.join(directory, "workspace.json"),
      traceSpoolFile: path.join(directory, "traces.jsonl"),
      nvidiaModel: modelId,
      nemoclawSandbox: "nemodoc",
      nemoclawReader: nativeReader,
    },
  );
  await app.locals.workspace.ready;
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: {
      dir: path.join(directory, "video"),
      size: { width: 1440, height: 1000 },
    },
  });
  const pageUI = await context.newPage();
  const errors: string[] = [];
  pageUI.on("pageerror", (error) => errors.push(error.message));
  const frontend = String(
    testInfo.project.use.baseURL || "http://127.0.0.1:5173",
  );
  let workerRun: Promise<void> | undefined;
  try {
    await context.route("**/api/agent**", async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      const body = request.postDataJSON() as any;
      if (
        [
          "/api/agent/workspace/run",
          "/api/agent/workspace/research-plan",
        ].includes(requestUrl.pathname)
      ) {
        selectedSourceId = body.sourceIds[0];
        selectedNotebookId = body.notebookId;
      }
      const response = await fetch(
        api + requestUrl.pathname + requestUrl.search,
        {
          method: request.method(),
          headers: { "Content-Type": "application/json" },
          body: request.postData() || undefined,
        },
      );
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: await response.text(),
      });
    });
    await pageUI.goto(new URL("/app", frontend).toString());
    await expect(pageUI.locator('[data-page="1"] canvas')).toBeVisible();
    await pageUI
      .getByLabel("Upload sources", { exact: true })
      .setInputFiles(pdfPath);
    await pageUI.getByRole("button", { name: "Agent", exact: true }).click();
    await pageUI
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    const web = pageUI.getByRole("region", { name: "Web research connection" });
    await web.getByLabel("Tavily API key").fill("fixture-tavily-key");
    await web
      .getByRole("button", { name: "Save web connection", exact: true })
      .click();
    await web
      .getByRole("button", { name: "Test web connection", exact: true })
      .click();
    await expect(web).toContainText("Tavily connection test passed.");
    await pageUI.getByRole("button", { name: "Tasks", exact: true }).click();
    const flow = pageUI.getByRole("region", { name: "Evidence workflows" });
    await expect(flow).toBeVisible();
    const approvalDocuments = flow
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("checkbox");
    await expect(approvalDocuments).toHaveCount(2);
    await approvalDocuments.last().check();
    await flow
      .getByLabel("I approve storing these selected snapshots on this server.")
      .check();
    await flow
      .getByRole("button", { name: "Approve snapshots", exact: true })
      .click();
    await flow
      .getByRole("button", { name: "Research team", exact: true })
      .click();
    await flow.getByLabel("Enable web research", { exact: true }).check();
    await flow
      .getByRole("button", { name: "Generate team plan", exact: true })
      .click();
    await expect(flow.getByLabel("Agent 1 name", { exact: true })).toHaveValue(
      "Definitions researcher",
    );
    await flow
      .getByLabel("Agent 1 assignment", { exact: true })
      .fill("Investigate definitions and assumptions");
    await flow
      .getByRole("button", { name: "Add researcher", exact: true })
      .click();
    await expect(
      flow.getByRole("article", { name: /^Assignment/ }),
    ).toHaveCount(4);
    await flow
      .getByRole("article", { name: "Assignment 3", exact: true })
      .getByRole("button", { name: "Remove researcher" })
      .click();
    await flow.getByLabel("I reviewed the team assignments").check();
    const start = flow.getByRole("button", {
      name: "Start research team",
      exact: true,
    });
    const originalRequest = await flow
      .getByLabel("Request", { exact: true })
      .inputValue();
    await flow.getByLabel("Request", { exact: true }).fill("Changed request");
    await expect(start).toBeDisabled();
    await expect(flow).toContainText("Regenerate the team plan");
    await flow.getByLabel("Request", { exact: true }).fill(originalRequest);
    await expect(start).toBeEnabled();
    await start.click();
    await expect(flow.locator("article[data-run-id]")).toHaveCount(1);
    workerRun = app.locals.workspace.worker.tick();
    await inferenceStarted;
    await expect(flow).toContainText("Waiting for inference", {
      timeout: 8000,
    });
    await expect(
      flow
        .locator(".research-agent-card .agent-monitor-status")
        .filter({ hasText: "Working" }),
    ).toHaveCount(2);
    expect(firstTargets.size).toBe(2);
    await expect(
      flow.getByRole("button", { name: "Cancel research" }),
    ).toBeVisible();
    releaseInference();
    await workerRun;
    const run = app.locals.workspace.repository
      .read(selectedNotebookId)
      .then((state: any) => state.runs[0]);
    const completed = await run;
    expect(completed.status).toBe("completed");
    expect(completed.researchTeam).toHaveLength(3);
    expect(completed.researchTeam.every((agent: any) => agent.answer)).toBe(
      true,
    );
    expect(completed.answer).toContain("cannot establish how neural networks");
    await expect(flow).toContainText("Lead synthesis");
    await expect(flow).toContainText("3/5 model calls");
    await expect(flow).toContainText("1/4 model calls");
    await expect(flow).toContainText("Run history and trace inspection");
    await expect(flow).toContainText("tool · call");
    expect(modelRequests).toHaveLength(8);
    expect(completed.executionRoute).toBe("application");
    expect(completed.webEvidence).toHaveLength(1);
    await expect(
      flow.locator(`.research-team-synthesis a[href="${webURL}"]`),
    ).toHaveCount(1);
    await flow
      .getByText(`Web evidence · ${completed.webEvidence.length} pages`, {
        exact: true,
      })
      .click();
    await expect(flow).toContainText("SYNTHETIC WEB FIXTURE");
    await expect(flow).toContainText("Retrieved");
    const documentCitation = completed.citations[0];
    await flow
      .locator(".research-team-synthesis")
      .getByRole("button", {
        name: `Open ${documentCitation.sourceName}, page ${documentCitation.page}, citation ${documentCitation.id}`,
        exact: true,
      })
      .click();
    await expect(pageUI.locator('[data-page="1"] canvas')).toBeVisible();
    await pageUI.screenshot({
      path: "output/research-team.png",
      fullPage: true,
    });
    expect(modelRequests.every((target) => target === modelId)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    releaseInference();
    if (workerRun) await workerRun.catch(() => {});
    await context.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
    app.locals.workspace.worker.stop();
    await app.locals.workspace.repository.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
