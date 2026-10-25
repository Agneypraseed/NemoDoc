import { test, expect } from "@playwright/test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/app.ts";
import { SettingsStore } from "../../server/settings.ts";
import type { WorkflowRun, WorkspaceState } from "../../src/workspace-types";
import { citationReferences } from "../../src/lib/citations";
import { parse } from "dotenv";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readBackup } from "../../src/lib/backup.ts";

test("real Nemotron MML research team records concurrent agents and their work in the UI", async ({
  browser,
}, testInfo) => {
  const family = process.env.NEMODOC_NVIDIA_RESEARCH_LIVE === "1";
  const synthetic = process.env.NEMODOC_LIVE_SYNTHETIC === "1";
  const recovery = process.env.NEMODOC_LIVE_RECOVER_DIR
    ? JSON.parse(
        readFileSync(
          path.join(process.env.NEMODOC_LIVE_RECOVER_DIR, "summary.json"),
          "utf8",
        ),
      )
    : undefined;
  test.skip(
    process.env.NEMODOC_MML_RESEARCH_LIVE !== "1" && !family,
    "Opt in explicitly to paid model calls using a local MML PDF and the saved notebook connection.",
  );
  test.setTimeout(900000);
  const book = path.resolve(
    synthetic
      ? "output/synthetic-live-pca.pdf"
      : process.env.NEMODOC_MML_BOOK || "data/mml-book.pdf",
  );
  if (synthetic) {
    mkdirSync("output", { recursive: true });
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const text of [
      "PUBLIC SYNTHETIC TEST PACKET - page 1. For centered observations x_i in R^d, define the sample covariance S = (1/n) sum x_i x_i^T. Principal component analysis selects orthonormal eigenvectors associated with the largest eigenvalues. These vectors form U and the reduced coordinates are z = U^T x. This packet is generated for software verification; it is not the MML book.",
      "PUBLIC SYNTHETIC TEST PACKET - page 2. The orthogonal reconstruction of x is U U^T x. Minimizing squared reconstruction error over orthonormal U selects the leading covariance eigenvectors. In the linear autoencoder comparison, squared reconstruction loss and an appropriate linear rank constraint can recover the same principal subspace. The network weights need not equal a unique eigenvector basis.",
      "PUBLIC SYNTHETIC TEST PACKET - page 3. This mathematical subspace comparison does not prove how nonlinear neural networks train or generalize. The packet contains no empirical benchmark, optimizer convergence study or nonlinear autoencoder experiment. All conclusions in a report must be limited to these three synthetic pages, with inference marked separately.",
    ]) {
      const page = pdf.addPage();
      page.drawText(text, {
        x: 45,
        y: 720,
        size: 12,
        font,
        maxWidth: 500,
        lineHeight: 19,
      });
    }
    writeFileSync(book, await pdf.save());
  }
  expect(
    existsSync(book),
    "Supply the local MML book; it is never committed.",
  ).toBe(true);
  const env = family ? parse(readFileSync(".env")) : {};
  const settings = new SettingsStore(
    {
      apiKey: "",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/Nemotron-3_5-Lightning",
    },
    family ? undefined : "data/settings.json",
  );
  if (family)
    Object.assign(settings.value, {
      baseUrl: env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      apiKey: env.NVIDIA_API_KEY,
    });
  const database = family
    ? JSON.parse(
        readFileSync(
          process.env.NEMODOC_RESEARCH_DATABASE_CONFIG ||
            "output/research-live-db.json",
          "utf8",
        ),
      )
    : undefined;
  expect(
    settings.value.apiKey,
    "Configure the notebook's live Nemotron connection.",
  ).toBeTruthy();
  mkdirSync("output", { recursive: true });
  const directory = mkdtempSync(
    path.resolve(
      synthetic ? "output/nemotron-team-live-" : "output/mml-research-live-",
    ),
  );
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
    let user: { assignment?: string } = {};
    if (body.messages?.[0]?.role === "system") {
      try {
        user = JSON.parse(body.messages?.[1]?.content || "{}");
      } catch {
        /* Observation must not change the provider request. */
      }
    }
    const request = {
      purpose: system.includes("Call connection_probe")
        ? "connection_test"
        : system.includes("Plan research assignments only")
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
  const appOptions = {
    workspaceFile: path.join(directory, "private", "workspace.json"),
    traceSpoolFile: path.join(directory, "trace.jsonl"),
    startWorkspaceWorker: true,
    databaseUrl: database?.databaseUrl,
    readDatabaseUrl: database?.readDatabaseUrl,
  };
  let app = createApp(settings.value, observedFetch, appOptions);
  await app.locals.workspace.ready;
  let server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const apiPort = (server.address() as AddressInfo).port;
  const familyModels = [
    {
      id: "live-lightning",
      name: "Nemotron Lightning",
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      capabilities: ["planning", "research", "mathematics"],
      costTier: "economy",
      strengths:
        "Fast source retrieval, passage summaries and task decomposition.",
    },
    {
      id: "live-super",
      name: "Nemotron Super",
      model: "nvidia/nemotron-3.5-super-vl-120b-a12b",
      capabilities: ["mathematics"],
      costTier: "balanced",
      strengths:
        "Mathematical derivations and interpreting original technical passages.",
    },
    {
      id: "live-ultra",
      name: "Nemotron Ultra",
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      capabilities: ["review"],
      costTier: "premium",
      strengths:
        "Critical review, resolve evidence disagreements and write final synthesis.",
    },
  ].filter((p) => !recovery || p.id !== "live-super");
  let recoveredState: WorkspaceState | undefined;
  if (recovery) {
    expect(family && !synthetic).toBe(true);
    recoveredState = await app.locals.workspace.repository.read(
      recovery.notebookId,
    );
    const failed = recoveredState!.runs.find((r) => r.id === recovery.runId)!;
    expect(failed.status).toBe("failed");
    expect(
      failed.researchTeam!.some((a) => a.status === "completed" && a.answer),
    ).toBe(true);
    expect(recoveredState!.sources).toHaveLength(1);
    writeFileSync(
      path.join(directory, "failed-run-proof.json"),
      JSON.stringify(
        {
          runId: failed.id,
          status: failed.status,
          error: failed.error,
          agents: failed.researchTeam?.map((a) => ({
            name: a.name,
            model: a.assignedModel,
            status: a.status,
            error: a.error,
            retainedFindings: !!a.answer,
          })),
          planningTraceId: failed.teamPlan?.planningTraceId,
        },
        null,
        2,
      ),
    );
  }
  if (family) {
    // Seed only private connection settings via Node HTTP. Provider keys never enter a browser trace.
    for (const profile of familyModels) {
      const result = await fetch(api + "/api/agent/workspace/model-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          baseUrl: settings.value.baseUrl,
          apiKey: settings.value.apiKey,
        }),
      });
      expect(result.ok).toBe(true);
    }
  }
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
  const title = `${synthetic ? "Synthetic PCA" : "MML"} multi-agent research ${new Date().toISOString()}`;
  let prompt =
    "Research PCA as dimensionality reduction and its connection to neural networks using only this MML book. Divide the work into complementary researchers: mathematical foundations (covariance, principal directions, projection and reconstruction error) and connections/limitations (whether retrieved excerpts establish a relationship to linear autoencoders or other neural-network representations). The critical reviewer must compare the findings against the retrieved original pages, distinguish source-supported claims from inference, and state which requested conclusions the retrieved evidence cannot establish. Do not infer whole-book absence from a few retrieved pages. Chapter 10, Principal Component Analysis, is around PDF pages 323–352. Cite the actual PDF page evidence returned by tools. Produce a concise report; do not propose notebook changes or email." +
    (family
      ? " Assign the mathematics task to the tested Nemotron Super profile, the source connections/limitations task to Nemotron Lightning, and the final critical review to Nemotron Ultra. These choices match the declared capabilities; explain their task fit in the plan."
      : "");
  if (synthetic)
    prompt = prompt
      .replace(
        "using only this MML book",
        "using only the supplied public synthetic test packet",
      )
      .replace(
        "Chapter 10, Principal Component Analysis, is around PDF pages 323–352.",
        "The supplied packet has exactly three pages; read PDF pages 1–3.",
      );
  if (recovery)
    prompt = prompt.replace(
      "Assign the mathematics task to the tested Nemotron Super profile, the source connections/limitations task to Nemotron Lightning, and the final critical review to Nemotron Ultra.",
      "Assign both research tasks to the tested Nemotron Lightning profile and the final critical review to Nemotron Ultra. The unavailable Super model has been excluded from this new reviewed plan.",
    );
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
    if (family) {
      await page
        .getByLabel("Agent sections", { exact: true })
        .getByRole("button", { name: "Connections", exact: true })
        .click();
      const models = page.getByRole("region", {
        name: "Research model connections",
        exact: true,
      });
      for (const profile of familyModels) {
        const row = models.getByRole("article", {
          name: `Research model ${profile.name}`,
          exact: true,
        });
        const probeResponse = page.waitForResponse(
          (response) =>
            response
              .url()
              .endsWith("/api/agent/workspace/model-profiles/test") &&
            response.request().method() === "POST",
        );
        await row
          .getByRole("button", { name: "Test model", exact: true })
          .click();
        const result = await probeResponse;
        const probe = await result.json();
        expect(
          result.ok(),
          probe.error ||
            "The saved profile should pass its real tool round trip.",
        ).toBe(true);
        await expect(row).toContainText("Ready", { timeout: 70000 });
      }
      await models
        .getByLabel("Planner model", { exact: true })
        .selectOption("live-lightning");
      await models
        .getByLabel("Routing priority", { exact: true })
        .selectOption("balanced");
      await models
        .getByRole("button", { name: "Save routing preferences", exact: true })
        .click();
      await expect(models.getByRole("status")).toContainText("settings saved");
    }
    await page.getByRole("button", { name: "Research", exact: true }).click();
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
      .getByLabel("Task type", { exact: true })
      .selectOption("research_team");
    await flow.getByLabel("Request", { exact: true }).fill(prompt);
    await flow
      .getByRole("button", { name: "Generate team plan", exact: true })
      .click();
    await expect(
      flow.getByRole("group", { name: "Review team assignments" }),
    ).toBeVisible({ timeout: 90000 });
    await expect(
      flow.getByRole("article", { name: /^Assignment/ }),
    ).toHaveCount(3);
    if (family) {
      const assignments = await flow
        .getByRole("article", { name: /^Assignment/ })
        .evaluateAll((cards) =>
          cards.map((c) => ({
            name: c.querySelector("input")?.value,
            model: c.querySelector("select")?.value,
          })),
        );
      expect(new Set(assignments.map((a) => a.model))).toEqual(
        new Set(familyModels.map((p) => p.id)),
      );
      writeFileSync(
        path.join(directory, "approved-plan.json"),
        JSON.stringify(assignments, null, 2),
      );
    }
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
    await expect(article).toContainText("Research report", { timeout: 10000 });
    await expect(article.locator(".research-agent-card")).toHaveCount(3);
    for (const agent of completed!.researchTeam!) {
      expect(agent.status, agent.error).toBe("completed");
      expect(agent.answer).toBeTruthy();
      expect(agent.citationIds.length).toBeGreaterThan(0);
      const card = article.locator(".research-agent-card").filter({
        has: page.getByText(agent.focus, { exact: true }),
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
      await card.screenshot({
        path: path.join(
          directory,
          `agent-${agent.id.replace(/[^a-z0-9_-]/gi, "_")}.png`,
        ),
      });
    }
    await article
      .locator(".research-team-synthesis")
      .getByRole("heading", { name: "Research report", exact: true })
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
    await flow
      .getByText("Run history and trace inspection", { exact: true })
      .click();
    await expect(flow).toContainText("tool · result");
    const logDownload = page.waitForEvent("download");
    await flow
      .getByRole("button", { name: "Export redacted trace JSON", exact: true })
      .click();
    const logPath = path.join(directory, "downloaded-activity-log.json");
    await (await logDownload).saveAs(logPath);
    const downloadedLog = JSON.parse(readFileSync(logPath, "utf8"));
    expect(downloadedLog.trace.traceId).toBe(runId);
    expect(downloadedLog.events.length).toBe(events.events.length);
    expect(JSON.stringify(downloadedLog)).not.toContain(settings.value.apiKey);
    await flow.getByText(/Agent and execution spans/).click();
    await expect(flow).toContainText(completed!.researchTeam![0].name);
    await page.screenshot({
      path: path.join(directory, "04-persisted-ui-trace.png"),
      fullPage: true,
    });
    if (family) {
      expect(app.locals.workspace.traces.status()).toBe("persisted");
      const pool = app.locals.workspace.repository.pool;
      const roots = await pool.query(
        "SELECT * FROM agent_traces WHERE trace_id=$1 AND notebook_id=$2",
        [runId, notebookId],
      );
      const spans = await pool.query(
        "SELECT * FROM agent_trace_spans WHERE trace_id=$1",
        [runId],
      );
      const rows = await pool.query(
        "SELECT * FROM agent_trace_events WHERE trace_id=$1 ORDER BY sequence",
        [runId],
      );
      const saved = await pool.query(
        "SELECT payload FROM workspace_runs WHERE id=$1 AND notebook_id=$2",
        [runId, notebookId],
      );
      expect(roots.rows[0].status).toBe("completed");
      const plannerRows = await pool.query(
        "SELECT status FROM agent_traces WHERE trace_id=$1 AND notebook_id=$2",
        [completed!.teamPlan!.planningTraceId, notebookId],
      );
      expect(plannerRows.rows[0].status).toBe("completed");
      expect(
        spans.rows.filter((s: any) => ["agent", "synthesis"].includes(s.kind)),
      ).toHaveLength(3);
      expect(
        rows.rows.filter((e: any) => e.event_type === "model.response").length,
      ).toBeGreaterThanOrEqual(5);
      expect(rows.rows.some((e: any) => e.event_type === "tool.result")).toBe(
        true,
      );
      expect(
        saved.rows[0].payload.researchTeam.every(
          (a: any) => a.answer && a.modelRoute && a.modelCalls,
        ),
      ).toBe(true);
      expect(
        new Set(completed!.researchTeam!.map((a) => a.assignedModel)).size,
      ).toBe(familyModels.length);
      expect(
        JSON.stringify({
          roots: roots.rows,
          spans: spans.rows,
          rows: rows.rows,
          run: saved.rows,
        }),
      ).not.toContain(settings.value.apiKey);
      writeFileSync(
        path.join(directory, "database-proof.json"),
        JSON.stringify(
          {
            server: (await pool.query("SELECT version()")).rows[0],
            runId,
            notebookId,
            rootStatus: roots.rows[0].status,
            planningTraceId: completed!.teamPlan!.planningTraceId,
            plannerStatus: plannerRows.rows[0].status,
            spans: spans.rows.length,
            events: rows.rows.length,
            modelResponses: rows.rows.filter(
              (e: any) => e.event_type === "model.response",
            ).length,
            tools: rows.rows.filter((e: any) => e.event_type === "tool.result")
              .length,
            persistedAgents: saved.rows[0].payload.researchTeam.map(
              (a: any) => ({
                name: a.name,
                model: a.assignedModel,
                status: a.status,
                usage: a.usage,
              }),
            ),
          },
          null,
          2,
        ),
      );
    }
    await article
      .getByRole("button", { name: "Save report to Notes", exact: true })
      .click();
    await expect(
      article.getByRole("button", { name: "Saved to Notes", exact: true }),
    ).toBeDisabled();
    const reportDownload = page.waitForEvent("download");
    await article
      .getByRole("button", { name: "Download report", exact: true })
      .click();
    await (
      await reportDownload
    ).saveAs(path.join(directory, "research-report.md"));
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
    if (family) {
      const count = requests.length;
      await page.goto("about:blank");
      app.locals.workspace.worker.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await app.locals.workspace.traces.close();
      await app.locals.workspace.repository.close();
      app = createApp(settings.value, observedFetch, appOptions);
      await app.locals.workspace.ready;
      server = app.listen(apiPort, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      expect(
        (await app.locals.workspace.repository.read(notebookId)).runs.find(
          (r: WorkflowRun) => r.id === runId,
        )?.status,
      ).toBe("completed");
      expect(
        (await app.locals.workspace.traces.detail(notebookId, runId)).spans,
      ).toHaveLength(detail.spans.length);
      expect(requests.length).toBe(count);
      writeFileSync(
        path.join(directory, "restart-proof.json"),
        JSON.stringify(
          {
            completedRunRestored: true,
            traceSpansRestored: detail.spans.length,
            inferenceCallsReplayed: requests.length - count,
          },
          null,
          2,
        ),
      );
    }
    if (family)
      await page.goto(
        new URL("/app", String(testInfo.project.use.baseURL)).toString(),
      );
    else await page.reload();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page.getByRole("button", { name: "Research", exact: true }).click();
    await expect(page.locator(`article[data-run-id="${runId}"]`)).toContainText(
      "Research report",
      { timeout: 15000 },
    );
    await expect(
      page.getByRole("button", { name: "Saved to Notes", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await page.getByRole("button", { name: "Notebook", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Notebook notes", exact: true }),
    ).toHaveValue(/Research report/);
    const archive = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Notebook actions", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Back up notebook", exact: true })
      .click();
    const archivePath = path.join(
      directory,
      "private",
      "completed-notebook.zip",
    );
    await (await archive).saveAs(archivePath);
    const backedUp = await readBackup(new Blob([readFileSync(archivePath)]));
    expect(backedUp.notebooks[0].savedResearchRuns).toContain(runId);
    expect(backedUp.notebooks[0].notes).toContain(completed!.answer);
    writeFileSync(
      path.join(directory, "backup-proof.json"),
      JSON.stringify(
        {
          notesPreserved: true,
          savedRunId: runId,
          sourcePages: backedUp.sources[0].pages.length,
        },
        null,
        2,
      ),
    );
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const repeated = page.locator(`article[data-run-id="${runId}"]`);
    const countBeforeReuse = requests.length;
    await repeated
      .getByRole("button", { name: "Use request again", exact: true })
      .click();
    await expect(flow.getByLabel("Request", { exact: true })).toHaveValue(
      completed!.prompt,
    );
    await expect(
      flow.getByRole("button", { name: "Start research team", exact: true }),
    ).toBeDisabled();
    expect(requests.length).toBe(countBeforeReuse);
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
          familyModels: family ? familyModels.map((p) => p.model) : undefined,
          provider: settings.value.baseUrl,
          source: synthetic
            ? "Public synthetic three-page PCA packet; real NVIDIA inference and PostgreSQL"
            : "Local MML PDF uploaded through the real UI",
          sourcePages: notebookId
            ? (await app.locals.workspace.repository.read(notebookId))
                .sources[0]?.pages.length
            : undefined,
          requests,
          errors,
          activeAgentsObserved: activeSaved,
          completedStatus: completed?.status,
          previousFailedRunId: recovery?.runId,
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
    await app.locals.workspace.traces.close();
    console.log(`Live MML research evidence: ${directory}`);
  }
});
