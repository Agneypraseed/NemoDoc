import { test, expect } from "./fixtures";
import { createApp } from "../../server/app.ts";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { NemoClawReader } from "../../server/agent-monitor.ts";

const modelId = "nvidia/test-nemotron";
const gateway = "http://127.0.0.1:18789/v1";
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

test("fixture browser journey routes three agents, shows inference waits, and inspects the persisted trace", async ({
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
    const target = String(body.model);
    modelRequests.push(target);
    const system = String(body.messages[0]?.content ?? "");
    if (
      system.includes(
        "You are NemoDoc's critical reviewer and final synthesis author.",
      )
    ) {
      const input = JSON.parse(body.messages[1].content);
      const citation = input.approvedEvidence[0].citation.match(/\d+/)?.[0];
      return modelResponse({
        content: `The synthetic MML page describes PCA [${citation}]. It cannot establish how neural networks are trained or generalize.`,
      });
    }
    const toolMessages = body.messages.filter(
      (message: any) => message.role === "tool",
    );
    if (toolMessages.length) {
      const output = JSON.parse(toolMessages.at(-1).content);
      return modelResponse({
        content: `The selected PCA passage supports this finding [${output[0].id}].`,
      });
    }
    firstTargets.add(target);
    if (firstTargets.size === 3) reportInferenceStarted();
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
  const connection = app.locals.agent.connections.value.model;
  Object.assign(connection, {
    mode: "openclaw",
    baseUrl: gateway,
    model: "openclaw/foundations",
    apiKey: "fixture-gateway-token",
    tested: true,
  });
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
      if (requestUrl.pathname === "/api/agent/workspace/run") {
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
      .getByRole("button", { name: "Research with 3 agents", exact: true })
      .click();
    await expect(flow.getByLabel("Foundations researcher")).toHaveValue(
      "foundations",
    );
    await expect(flow.getByLabel("Neural networks researcher")).toHaveValue(
      "neural-networks",
    );
    await expect(flow.getByLabel("Critical reviewer")).toHaveValue(
      "critical-review",
    );
    expect(modelRequests).toEqual([]);
    const start = flow.getByRole("button", {
      name: "Start 3-agent research",
      exact: true,
    });
    await expect(start).toBeEnabled();
    await start.click();
    await expect(flow.locator("article[data-run-id]")).toHaveCount(1);
    workerRun = app.locals.workspace.worker.tick();
    await inferenceStarted;
    await expect(flow).toContainText("Waiting for inference", {
      timeout: 8000,
    });
    expect(firstTargets).toEqual(
      new Set([
        "openclaw/foundations",
        "openclaw/neural-networks",
        "openclaw/critical-review",
      ]),
    );
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
    await expect(flow).toContainText("Run history and trace inspection");
    await expect(flow).toContainText("tool · call");
    expect(modelRequests).toHaveLength(7);
    expect(
      modelRequests.every((target) => target.startsWith("openclaw/")),
    ).toBe(true);
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
