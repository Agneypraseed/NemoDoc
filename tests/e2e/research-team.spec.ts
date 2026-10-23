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

function modelResponse(message: unknown, model = modelId) {
  return new Response(
    JSON.stringify({
      id: "fixture-response",
      model,
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

for (const multiModel of [false, true]) {
  test(`application research ${multiModel ? "routes distinct models and records manual overrides" : "edits a plan, reads notebook and web evidence, and inspects durable traces"}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90000);
    const directory = mkdtempSync(
      path.join(tmpdir(), "nemodoc-research-team-"),
    );
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
    const release = new Promise<void>(
      (resolve) => (releaseInference = resolve),
    );
    const inferenceStarted = new Promise<void>(
      (resolve) => (reportInferenceStarted = resolve),
    );
    let selectedSourceId = "";
    let selectedNotebookId = "";
    let profileIds: string[] = [];
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
      if (String(body.messages[0]?.content).includes("Call connection_probe")) {
        const result = body.messages.find((m: any) => m.role === "tool");
        return modelResponse(
          result
            ? { content: JSON.parse(result.content).receipt }
            : {
                tool_calls: [
                  {
                    id: "probe",
                    type: "function",
                    function: {
                      name: "connection_probe",
                      arguments: '{"ok":true}',
                    },
                  },
                ],
              },
          target,
        );
      }
      if (multiModel && target !== modelId)
        expect(String(_url)).toBe(
          `https://${target}.example.test/v1/chat/completions`,
        );
      modelRequests.push(target);
      const respond = (message: unknown) => modelResponse(message, target);
      const system = String(body.messages[0]?.content ?? "");
      if (system.includes("Plan research assignments only"))
        return respond({
          content: JSON.stringify(
            multiModel
              ? {
                  agents: assignments.agents.map((agent, i) => ({
                    ...agent,
                    modelProfileId: profileIds[i],
                    modelReason: `Selected for ${agent.assignment.toLowerCase()}.`,
                  })),
                }
              : assignments,
          ),
        });
      if (
        system.includes(
          "You are NemoDoc's critical reviewer and final synthesis author.",
        )
      ) {
        const input = JSON.parse(body.messages[1].content);
        const citation = input.evidence[0].id;
        return respond({
          content: `The synthetic MML page describes PCA [${citation}]. The web comparison [${input.evidence.find((e: any) => e.url).id}] cannot establish how neural networks are trained or generalize.`,
        });
      }
      const toolMessages = body.messages.filter(
        (message: any) => message.role === "tool",
      );
      if (toolMessages.length === 2)
        return respond({
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
        return respond({
          content: `The selected PCA passage supports this finding [${output[0].id}].`,
        });
      }
      firstTargets.add(JSON.parse(body.messages[1].content).assignment);
      if (firstTargets.size === 2) reportInferenceStarted();
      await release;
      const agentId = target.split("/").at(-1);
      return respond({
        content: null,
        tool_calls: [
          {
            id: `read-${agentId}`,
            type: "function",
            function: {
              name: "read_passage",
              arguments: JSON.stringify({
                sourceId: selectedSourceId,
                page: 1,
              }),
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
        .getByLabel("Agent sections", { exact: true })
        .getByRole("button", { name: "Connections", exact: true })
        .click();
      const web = pageUI.getByRole("region", {
        name: "Web research connection",
      });
      await web.getByLabel("Search API key").fill("fixture-tavily-key");
      await web
        .getByRole("button", { name: "Save & test search", exact: true })
        .click();
      await expect(web.getByRole("status")).toHaveText("Tavily connected.");
      if (multiModel) {
        const models = pageUI.getByRole("region", {
          name: "Research model connections",
        });
        for (const [index, name] of ["math", "fast", "review"].entries()) {
          await models
            .getByRole("button", { name: "Add research model", exact: true })
            .click();
          const form = models.getByRole("form", {
            name: "Research model profile",
          });
          await form.getByLabel("Profile name", { exact: true }).fill(name);
          await form
            .getByLabel("API base URL", { exact: true })
            .fill(`https://${name}.example.test/v1`);
          await form.getByLabel("Model ID", { exact: true }).fill(name);
          await form
            .getByLabel("Model API key", { exact: true })
            .fill(`fixture-${name}-key`);
          await form
            .getByLabel(
              index === 0 ? "mathematics" : index === 2 ? "review" : "planning",
              { exact: true },
            )
            .check();
          await form
            .getByLabel("Cost tier", { exact: true })
            .selectOption(index === 1 ? "economy" : "premium");
          await form
            .getByRole("button", { name: "Save research model", exact: true })
            .click();
          const row = models.getByRole("article", {
            name: `Research model ${name}`,
            exact: true,
          });
          await expect(row).toContainText("Not tested");
          await row
            .getByRole("button", { name: "Test model", exact: true })
            .click();
          await expect(row).toContainText("Ready");
        }
        const catalog = await (
          await fetch(api + "/api/agent/workspace/model-profiles")
        ).json();
        profileIds = ["math", "fast", "review"].map(
          (name) => catalog.profiles.find((p: any) => p.name === name).id,
        );
        await models
          .getByLabel("Planner model", { exact: true })
          .selectOption(profileIds[1]);
        await models
          .getByLabel("Routing priority", { exact: true })
          .selectOption("cost");
        await models
          .getByRole("button", {
            name: "Save routing preferences",
            exact: true,
          })
          .click();
        await expect(models.getByRole("status")).toHaveText(
          "Research model settings saved.",
        );
      }
      await pageUI
        .getByRole("button", { name: "Research", exact: true })
        .click();
      const flow = pageUI.getByRole("region", { name: "Evidence workflows" });
      await expect(flow).toBeVisible();
      await expect(pageUI.locator('[aria-label="Notebook chat"]')).toBeHidden();
      const approvalDocuments = flow
        .getByRole("group", { name: "Documents", exact: true })
        .getByRole("checkbox");
      await expect(approvalDocuments).toHaveCount(2);
      await approvalDocuments.last().check();
      await flow
        .getByLabel(
          "I approve storing these selected snapshots on this server.",
        )
        .check();
      await flow
        .getByRole("button", { name: "Approve snapshots", exact: true })
        .click();
      await flow
        .getByLabel("Task type", { exact: true })
        .selectOption("research_team");
      await flow
        .getByLabel("Request", { exact: true })
        .fill("Compare the PCA evidence and its limitations.");
      await flow
        .getByLabel("Task type", { exact: true })
        .selectOption("study_revision");
      await expect(flow.getByLabel("Request", { exact: true })).toHaveValue(
        "Compare the PCA evidence and its limitations.",
      );
      await flow
        .getByLabel("Task type", { exact: true })
        .selectOption("research_team");
      await flow.getByLabel("Enable web research", { exact: true }).check();
      await flow
        .getByRole("button", { name: "Generate team plan", exact: true })
        .click();
      await expect(
        flow.getByLabel("Agent 1 name", { exact: true }),
      ).toHaveValue("Definitions researcher");
      if (multiModel) {
        await expect(
          flow.getByLabel("Agent 1 model", { exact: true }),
        ).toHaveValue(profileIds[0]);
        await expect(
          flow.getByLabel("Agent 2 model", { exact: true }),
        ).toHaveValue(profileIds[1]);
        await expect(
          flow.getByLabel("Agent 3 model", { exact: true }),
        ).toHaveValue(profileIds[2]);
        await flow
          .getByLabel("Agent 1 model", { exact: true })
          .selectOption(profileIds[1]);
        await expect(flow).toContainText("Manual choice");
      }
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
      const moving = flow
        .locator(".research-agent-indicator.is-running svg")
        .first();
      await expect(moving).toHaveCSS("animation-name", "agent-spin");
      await pageUI.emulateMedia({ reducedMotion: "reduce" });
      await expect(moving).toHaveCSS("animation-name", "none");
      await pageUI.emulateMedia({ reducedMotion: "no-preference" });
      await flow.locator(".research-team-heading").scrollIntoViewIfNeeded();
      await pageUI.screenshot({ path: "output/research-agents-working.png" });
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
      expect(completed.answer).toContain(
        "cannot establish how neural networks",
      );
      await expect(flow).toContainText("Research report");
      await expect(flow).toContainText("3/5 model calls");
      await expect(flow).toContainText("1/4 model calls");
      await expect(flow).toContainText("Run history and trace inspection");
      await expect(flow).toContainText("tool · call");
      expect(modelRequests).toHaveLength(8);
      expect(completed.executionRoute).toBe("application");
      expect(completed.webEvidence).toHaveLength(1);
      await flow
        .getByRole("button", { name: "Save report to Notes", exact: true })
        .click();
      await expect(
        flow.getByRole("button", { name: "Saved to Notes", exact: true }),
      ).toBeDisabled();
      const downloaded = pageUI.waitForEvent("download");
      await flow
        .getByRole("button", { name: "Download report", exact: true })
        .click();
      expect((await downloaded).suggestedFilename()).toMatch(
        /^research-.*\.md$/,
      );
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
      if (multiModel) {
        expect(modelRequests[0]).toBe("fast");
        expect(new Set(modelRequests)).toEqual(new Set(["fast", "review"]));
        expect(completed.researchTeam.map((a: any) => a.assignedModel)).toEqual(
          ["fast", "fast", "review"],
        );
        expect(completed.researchTeam[0].modelRoute.selection).toBe("manual");
        await expect(flow).toContainText("Planner: fast");
        await pageUI.reload();
        await pageUI
          .getByRole("button", { name: "Agent", exact: true })
          .click();
        await pageUI
          .getByRole("button", { name: "Research", exact: true })
          .click();
        await expect(flow).toContainText("Manual choice");
        await expect(flow).toContainText("Model: review");
        await expect(
          flow.getByRole("button", { name: "Saved to Notes", exact: true }),
        ).toBeDisabled();
        await flow
          .locator(".research-agent-card")
          .first()
          .getByText("Model & usage", { exact: true })
          .click();
        await flow.locator(".research-agent-card").first().screenshot({
          path: "output/research-model-routing.png",
        });
        await pageUI.setViewportSize({ width: 390, height: 844 });
        await expect
          .poll(() =>
            pageUI.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          )
          .toBe(true);
        await flow.locator(".research-team-synthesis").scrollIntoViewIfNeeded();
        await pageUI.screenshot({ path: "output/research-mobile.png" });
        await pageUI.setViewportSize({ width: 1440, height: 1000 });
      } else
        expect(modelRequests.every((target) => target === modelId)).toBe(true);
      if (multiModel) {
        const callsBeforeDashboard = modelRequests.length;
        await pageUI
          .getByRole("button", { name: "Dashboard", exact: true })
          .click();
        const dashboard = pageUI.getByRole("region", {
          name: "Agent dashboard",
          exact: true,
        });
        await expect(
          dashboard.getByRole("heading", {
            name: "Agent dashboard",
            exact: true,
          }),
        ).toBeVisible();
        await expect(dashboard.getByLabel("Activity totals")).toContainText(
          "Recorded tokens",
        );
        await expect(dashboard).toContainText("Not configured");
        await expect(dashboard.locator("tbody").first()).toContainText(
          "review",
        );
        await dashboard.getByLabel("Period", { exact: true }).selectOption("7");
        await dashboard
          .getByLabel("Model", { exact: true })
          .selectOption("https://review.example.test|review");
        await expect(
          dashboard.locator("tbody").first().locator("tr"),
        ).toHaveCount(1);
        await expect(dashboard.locator("tbody").first()).toContainText(
          "review",
        );
        await dashboard.getByLabel("Model", { exact: true }).selectOption("");
        await dashboard
          .getByLabel("Period", { exact: true })
          .selectOption("30");
        await expect(
          dashboard.locator("tbody").first().locator("tr"),
        ).toHaveCount(2);
        await pageUI.setViewportSize({ width: 1505, height: 1045 });
        await pageUI.screenshot({ path: "output/agent-dashboard-desktop.png" });
        await dashboard
          .getByLabel("Status", { exact: true })
          .selectOption("failed");
        await expect(dashboard).toContainText("No work matches these filters.");
        await dashboard
          .getByRole("button", { name: "Clear filters", exact: true })
          .click();
        await dashboard
          .getByRole("button", { name: "Pricing settings", exact: true })
          .click();
        await dashboard
          .getByLabel("fast input rate", { exact: true })
          .fill("1");
        await dashboard
          .getByLabel("fast output rate", { exact: true })
          .fill("2");
        await dashboard
          .getByRole("button", { name: "Save pricing", exact: true })
          .click();
        await expect(dashboard.locator("tbody").first()).toContainText("$");
        await dashboard
          .getByRole("heading", { name: "Recent work", exact: true })
          .scrollIntoViewIfNeeded();
        await pageUI.screenshot({ path: "output/agent-dashboard-history.png" });
        await dashboard
          .getByRole("button", { name: "Inspect Research team", exact: true })
          .click();
        const inspection = dashboard.getByRole("region", {
          name: "Selected activity",
        });
        await expect(inspection).toContainText("Completed");
        const activityDownload = pageUI.waitForEvent("download");
        await inspection
          .getByRole("button", { name: "Download activity log", exact: true })
          .click();
        expect((await activityDownload).suggestedFilename()).toMatch(
          /^agent-trace-/,
        );
        await pageUI.emulateMedia({ reducedMotion: "reduce" });
        await pageUI.setViewportSize({ width: 390, height: 844 });
        await expect
          .poll(() =>
            pageUI.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        await pageUI.locator(".agent-primary-nav").scrollIntoViewIfNeeded();
        await pageUI.screenshot({ path: "output/agent-dashboard-mobile.png" });
        await pageUI.setViewportSize({ width: 1440, height: 1000 });
        await inspection
          .getByRole("button", { name: "Open findings & actions", exact: true })
          .click();
        await expect(flow.locator(".research-diagnostics")).toHaveAttribute(
          "open",
          "",
        );
        await pageUI
          .getByRole("button", { name: "Dashboard", exact: true })
          .click();
        await dashboard
          .getByRole("button", { name: "New research", exact: true })
          .click();
        await expect(flow.locator(".research-compose")).toHaveAttribute(
          "open",
          "",
        );
        expect(modelRequests.length).toBe(callsBeforeDashboard);
      }
      expect(errors).toEqual([]);
      await pageUI.getByRole("button", { name: "Notes", exact: true }).click();
      await pageUI
        .getByRole("button", { name: "Notebook", exact: true })
        .click();
      await expect(
        pageUI.getByRole("textbox", { name: "Notebook notes", exact: true }),
      ).toHaveValue(
        /Research report[\s\S]*Cited evidence[\s\S]*Synthetic web research/,
      );
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
}
