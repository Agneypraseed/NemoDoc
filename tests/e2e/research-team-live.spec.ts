import { test, expect } from "@playwright/test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/app.ts";
import { SettingsStore } from "../../server/settings.ts";
import type { WorkflowRun, WorkspaceState } from "../../src/workspace-types";
import { citationReferences } from "../../src/lib/citations";

test("real Nemotron MML research team records concurrent agents and their work in the UI", async ({
  browser,
}, testInfo) => {
  test.skip(
    process.env.NEMODOC_MML_RESEARCH_LIVE !== "1",
    "Opt in explicitly to paid model calls using a local MML PDF and the saved notebook connection.",
  );
  test.setTimeout(900000);
  const book = path.resolve(
    process.env.NEMODOC_MML_BOOK || "data/mml-book.pdf",
  );
  expect(
    existsSync(book),
    "Supply the local MML book; it is never committed.",
  ).toBe(true);
  const settings = new SettingsStore(
    {
      apiKey: "",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/Nemotron-3_5-Lightning",
    },
    "data/settings.json",
  );
  expect(
    settings.value.apiKey,
    "Configure the notebook's live Nemotron connection.",
  ).toBeTruthy();
  mkdirSync("output", { recursive: true });
  const directory = mkdtempSync(path.resolve("output/mml-research-live-"));
  const requests: {
    purpose: string;
    assignment?: string;
    model: string;
    startedAt: number;
    finishedAt?: number;
    status?: number;
  }[] = [];
  // Observe real requests without changing prompts, responses, timing, or tool results.
  const observedFetch: typeof fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    const system = String(body.messages?.[0]?.content ?? "");
    const user = JSON.parse(body.messages?.[1]?.content || "{}");
    const request = {
      purpose: system.includes("Plan research assignments only")
        ? "planner"
        : system.includes("critical reviewer and final synthesis")
          ? "reviewer"
          : "researcher",
      assignment: user.assignment,
      model: String(body.model),
      startedAt: Date.now(),
    } as (typeof requests)[number];
    requests.push(request);
    try {
      const result = await fetch(url, init);
      request.status = result.status;
      return result;
    } finally {
      request.finishedAt = Date.now();
    }
  };
  // No production workspace, SMTP configuration, or runtime gateway credentials are loaded.
  const app = createApp(settings.value, observedFetch, {
    workspaceFile: path.join(directory, "workspace.json"),
    traceSpoolFile: path.join(directory, "trace.jsonl"),
    startWorkspaceWorker: true,
  });
  await app.locals.workspace.ready;
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    recordVideo: {
      dir: path.join(directory, "video"),
      size: { width: 1600, height: 1100 },
    },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const observations: {
    at: number;
    agents: {
      name: string;
      assignment: string;
      stage: string;
      status: string;
    }[];
  }[] = [];
  let notebookId = "",
    runId = "",
    completed: WorkflowRun | undefined;
  let success = false,
    activeSaved = false;
  const title = `MML multi-agent research ${new Date().toISOString()}`;
  const prompt =
    "Research PCA as dimensionality reduction and its connection to neural networks using only this MML book. Divide the work into complementary researchers: mathematical foundations (covariance, principal directions, projection and reconstruction error) and connections/limitations (whether the book actually establishes a relationship to linear autoencoders or other neural-network representations). The critical reviewer must compare the findings against the retrieved original pages, distinguish source-supported claims from inference, and explicitly state any requested neural-network training or empirical-performance conclusions that this book cannot establish. Chapter 10, Principal Component Analysis, is around PDF pages 323–352. Cite the actual PDF page evidence returned by tools. Produce a concise report; do not propose notebook changes or email.";
  await context.route("**/api/agent**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.endsWith("/run") && request.method() === "POST")
      notebookId = request.postDataJSON().notebookId;
    const response = await fetch(api + url.pathname + url.search, {
      method: request.method(),
      headers: { "Content-Type": "application/json" },
      body: request.postData() || undefined,
    });
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  try {
    await page.goto(
      new URL("/app", String(testInfo.project.use.baseURL)).toString(),
    );
    await page
      .getByRole("button", { name: "New notebook", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Notebook title" }).fill(title);
    await page
      .getByRole("button", { name: "Create notebook", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Upload sources", { exact: true })
      .setInputFiles(book);
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible({
      timeout: 120000,
    });
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page.getByRole("button", { name: "Tasks", exact: true }).click();
    const flow = page.getByRole("region", { name: "Evidence workflows" });
    await flow
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("checkbox")
      .check();
    await flow
      .getByLabel("I approve storing these selected snapshots on this server.")
      .check();
    await flow
      .getByRole("button", { name: "Approve snapshots", exact: true })
      .click();
    await flow
      .getByRole("button", { name: "Research team", exact: true })
      .click();
    await flow.getByLabel("Request", { exact: true }).fill(prompt);
    await expect(flow.getByLabel("Research execution route")).toHaveValue(
      "application",
    );
    await flow
      .getByRole("button", { name: "Generate team plan", exact: true })
      .click();
    await expect(
      flow.getByRole("group", { name: "Review team assignments" }),
    ).toBeVisible({ timeout: 90000 });
    await expect(
      flow.getByRole("article", { name: /^Assignment/ }),
    ).toHaveCount(3);
    await page.screenshot({
      path: path.join(directory, "01-team-plan.png"),
      fullPage: true,
    });
    await flow.getByLabel("I reviewed the team assignments").check();
    await flow
      .getByRole("button", { name: "Start research team", exact: true })
      .click();
    const article = flow.locator("article[data-run-id]").first();
    await expect(article).toBeVisible();
    runId = (await article.getAttribute("data-run-id"))!;
    const deadline = Date.now() + 650000;
    while (Date.now() < deadline) {
      const state: WorkspaceState =
        await app.locals.workspace.repository.read(notebookId);
      const run = state.runs.find((r) => r.id === runId)!;
      const agents = await article
        .locator(".research-agent-card")
        .evaluateAll((cards) =>
          cards.map((card) => ({
            name: card.querySelector("h6")?.textContent || "",
            assignment:
              card.querySelector(".research-agent-focus")?.textContent || "",
            stage:
              card.querySelector(".research-agent-stage")?.textContent || "",
            status:
              card
                .querySelector(".agent-monitor-status")
                ?.textContent?.trim() || "",
          })),
        );
      observations.push({ at: Date.now(), agents });
      if (
        !activeSaved &&
        agents.filter((a) => a.status === "Working").length >= 2
      ) {
        await article
          .locator(".research-agent-card")
          .first()
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: path.join(directory, "02-agents-working.png"),
          fullPage: true,
        });
        activeSaved = true;
      }
      if (!["queued", "running"].includes(run.status)) {
        completed = run;
        break;
      }
      await page.waitForTimeout(1000);
    }
    expect(
      completed,
      "The bounded research run should finish and retain its status.",
    ).toBeTruthy();
    writeFileSync(
      path.join(directory, "run.json"),
      JSON.stringify(completed, null, 2),
    );
    expect(completed!.status, completed!.error).toBe("completed");
    await expect(article).toContainText("Lead synthesis", { timeout: 10000 });
    await expect(article.locator(".research-agent-card")).toHaveCount(3);
    for (const agent of completed!.researchTeam!) {
      expect(agent.status, agent.error).toBe("completed");
      expect(agent.answer).toBeTruthy();
      expect(agent.citationIds.length).toBeGreaterThan(0);
      const card = article.locator(".research-agent-card").filter({
        has: page.getByRole("heading", { name: agent.name, exact: true }),
      });
      await expect(card).toContainText(agent.focus);
      await expect(card.locator(".agent-monitor-status")).toContainText(
        "Completed",
      );
      await card
        .getByText("Read this agent’s findings", { exact: true })
        .click();
      await expect(card.locator(".research-agent-findings")).toHaveAttribute(
        "open",
        "",
      );
      expect(
        (await card.locator(".research-agent-findings").innerText()).length,
      ).toBeGreaterThan(40);
    }
    await article
      .locator(".research-team-synthesis")
      .getByRole("heading", { name: "Lead synthesis", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(directory, "03-completed-agents-and-report.png"),
    });
    expect(
      activeSaved,
      "The actual UI should display at least two active researchers.",
    ).toBe(true);
    const known = new Set(completed!.citations.map((c) => c.id));
    const cited = citationReferences(completed!.answer, completed!.citations);
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.every((id) => known.has(id))).toBe(true);
    const detail = await app.locals.workspace.traces.detail(notebookId, runId);
    const events = await app.locals.workspace.traces.events(
      notebookId,
      runId,
      0,
      1000,
    );
    writeFileSync(
      path.join(directory, "trace-export.json"),
      JSON.stringify({ detail, events }, null, 2),
    );
    const agentSpans = detail.spans.filter(
      (s: { kind: string }) => s.kind === "agent",
    );
    expect(agentSpans).toHaveLength(2);
    expect(
      Math.max(...agentSpans.map((s: { startedAt: number }) => s.startedAt)),
    ).toBeLessThan(
      Math.min(...agentSpans.map((s: { finishedAt: number }) => s.finishedAt)),
    );
    const review = detail.spans.find(
      (s: { kind: string }) => s.kind === "synthesis",
    );
    expect(review.startedAt).toBeGreaterThanOrEqual(
      Math.max(...agentSpans.map((s: { finishedAt: number }) => s.finishedAt)),
    );
    expect(
      events.events.some((e: { type: string }) => e.type === "tool.result"),
    ).toBe(true);
    await expect(flow).toContainText("Run history and trace inspection");
    await expect(flow).toContainText("tool · result");
    await flow.getByText(/Agent and execution spans/).click();
    await expect(flow).toContainText(completed!.researchTeam![0].name);
    await page.screenshot({
      path: path.join(directory, "04-persisted-ui-trace.png"),
      fullPage: true,
    });
    // The original local PDF navigation must still work after multi-agent research.
    const citation = completed!.citations.find((c) => cited.includes(c.id))!;
    await article
      .locator(".research-team-synthesis")
      .getByRole("button", {
        name: `Open ${citation.sourceName}, page ${citation.page}, citation ${citation.id}`,
        exact: true,
      })
      .first()
      .click();
    await expect(
      page.locator(`[data-page="${citation.page}"] canvas`),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: path.join(directory, "05-local-supporting-page.png"),
      fullPage: true,
    });
    await page.reload();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page.getByRole("button", { name: "Tasks", exact: true }).click();
    await expect(page.locator(`article[data-run-id="${runId}"]`)).toContainText(
      "Lead synthesis",
      { timeout: 15000 },
    );
    expect(
      requests.filter((r) => r.purpose === "researcher").length,
    ).toBeGreaterThanOrEqual(4);
    expect(requests.every((r) => r.status === 200)).toBe(true);
    expect(errors).toEqual([]);
    success = true;
  } finally {
    writeFileSync(
      path.join(directory, "observations.json"),
      JSON.stringify(observations, null, 2),
    );
    writeFileSync(
      path.join(directory, "summary.json"),
      JSON.stringify(
        {
          success,
          title,
          notebookId,
          runId,
          model: settings.value.model,
          provider: settings.value.baseUrl,
          source: "Local MML PDF uploaded through the real UI",
          sourcePages: notebookId
            ? (await app.locals.workspace.repository.read(notebookId))
                .sources[0]?.pages.length
            : undefined,
          requests,
          errors,
          activeAgentsObserved: activeSaved,
          completedStatus: completed?.status,
          agents: completed?.researchTeam?.map((a) => ({
            name: a.name,
            assignment: a.focus,
            status: a.status,
            modelCalls: a.modelCalls,
            readActions: a.readActions,
            citationIds: a.citationIds,
            usage: a.usage,
          })),
        },
        null,
        2,
      ),
    );
    const video = page.video();
    await page
      .screenshot({ path: path.join(directory, "last-ui.png"), fullPage: true })
      .catch(() => {});
    if (notebookId && runId && !success)
      await app.locals.workspace.worker
        .cancel(notebookId, runId)
        .catch(() => {});
    app.locals.workspace.worker.stop();
    await context.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
    if (video)
      copyFileSync(
        await video.path(),
        path.join(directory, "walkthrough.webm"),
      );
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.locals.workspace.repository.close();
    console.log(`Live MML research evidence: ${directory}`);
  }
});
