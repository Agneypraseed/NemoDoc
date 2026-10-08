import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { config as loadEnv } from "dotenv";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/app.ts";

test.use({ actionTimeout: 20000 });

// Opt in explicitly: this test makes real, billable inference calls. Only an
// original, non-sensitive fixture is sent. No mocked provider responses.
test("live Nebius document and personal agent workflow", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.NEMODOC_LIVE !== "1",
    "Set NEMODOC_LIVE=1 to use real inference.",
  );
  test.setTimeout(480000);
  loadEnv({ quiet: true });
  expect(Boolean(process.env.NEBIUS_API_KEY)).toBe(true);
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-live-"));
  const responseShapes: unknown[] = [];
  let generatedQuiz: any;
  const realFetch = (async (url, init) => {
    const response = await fetch(url, init);
    if (
      String(url).endsWith("/chat/completions") &&
      response.ok &&
      response.headers.get("content-type")?.includes("application/json")
    ) {
      const json = await response.clone().json();
      const message = json.choices?.[0]?.message;
      responseShapes.push({
        toolCalls:
          message?.tool_calls === null ? "null" : typeof message?.tool_calls,
        content: typeof message?.content,
      });
    }
    return response;
  }) as typeof fetch;
  const app = createApp(
    {
      apiKey: process.env.NEBIUS_API_KEY!,
      baseUrl:
        process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1",
      model: process.env.NEBIUS_MODEL || "nvidia/Nemotron-3_5-Lightning",
    },
    realFetch,
    { agentFile: path.join(directory, "agent.json") },
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (route: string, body: unknown) => {
    const response = await fetch(api + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    expect(response.ok, JSON.stringify(value)).toBe(true);
    return value;
  };
  // Proxy the browser's local API to an isolated real server; the server uses
  // global fetch to contact Nebius. User notebooks/agent data are untouched.
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const response = await fetch(api + new URL(request.url()).pathname, {
      method: request.method(),
      headers: { "Content-Type": "application/json" },
      body: request.postData() || undefined,
    });
    if (new URL(request.url()).pathname === "/api/study" && response.ok) {
      generatedQuiz = await response.clone().json();
    }
    await route.fulfill({
      status: response.status,
      contentType: response.headers.get("content-type") || "application/json",
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  const facts = [
    "Spaced practice: Review new material after one day, three days, and seven days.\nRetrieval practice means recalling an answer before looking at notes.\nShort study sessions last 25 minutes, followed by a five-minute break.",
    "Learning experiment: Ada studied 12 vocabulary words using spaced practice.\nAfter seven days, Ada remembered 10 words. Ben crammed and remembered 6 words.\nThis small experiment does not establish that the method works for everyone.",
  ];
  const evidence: Record<string, unknown> = {
    provider: "Nebius Token Factory",
    checkedAt: new Date().toISOString(),
  };
  try {
    evidence.connection = await post("/api/settings/test", {});
    const catalog = await (await fetch(api + "/api/models")).json();
    expect(catalog.models).toContain(
      process.env.NEBIUS_MODEL || "nvidia/Nemotron-3_5-Lightning",
    );
    await page.goto("/");
    await page
      .getByRole("button", { name: "New notebook", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Notebook title" })
      .fill("Live workflow check");
    await page
      .getByRole("button", { name: "Create notebook", exact: true })
      .click();
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const text of facts)
      pdf
        .addPage()
        .drawText(text, { x: 40, y: 720, size: 12, lineHeight: 22, font });
    await page.getByLabel("Upload sources", { exact: true }).setInputFiles({
      name: "Learning experiment.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    });
    const selected = page
      .locator('[data-page="1"] .textLayer span')
      .filter({ hasText: "Spaced practice" })
      .first();
    await expect(selected).toBeVisible();
    await selected.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.locator(".page-scroller").dispatchEvent("mouseup");
    await page.getByRole("button", { name: "Note", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Annotation note" })
      .fill("Practice recall before reading notes.");
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Ask about your sources" })
      .fill(
        "How many words did Ada and Ben remember after seven days? Cite the source.",
      );
    await page
      .getByRole("button", { name: "Send question", exact: true })
      .click();
    await expect(page.locator(".message.assistant").last()).toContainText(
      "10",
      { timeout: 90000 },
    );
    await expect(page.locator(".message.assistant").last()).toContainText("6");
    await expect(page.locator(".inline-citation").first()).toBeVisible();
    await page.locator(".inline-citation").first().click();
    await expect(
      page.getByRole("textbox", { name: "Page number", exact: true }),
    ).toHaveValue("2");
    evidence.chat =
      "Real answer contained both fixture facts; citation navigated to page 2.";
    await page.getByRole("button", { name: "Studio", exact: true }).click();
    await page.getByRole("button", { name: "Quiz", exact: true }).click();
    await expect(page.locator(".study-quiz fieldset").first()).toBeVisible({
      timeout: 90000,
    });
    const questions = await page.locator(".study-quiz fieldset").all();
    for (let i = 0; i < questions.length; i++) {
      const item = generatedQuiz.items[i];
      await questions[i]
        .getByRole("radio")
        .nth((item.correct + 1) % item.choices.length)
        .check();
    }
    await page
      .getByRole("button", { name: "Check answers", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remember quiz result", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Progress remembered", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page.getByRole("button", { name: "Memory", exact: true }).click();
    await page.getByRole("button", { name: "Add memory", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Memory", exact: true })
      .fill("I prefer 25-minute study sessions. My exam is in seven days.");
    await page.getByLabel("Memory type").selectOption("preference");
    await page
      .getByRole("button", { name: "Save memory", exact: true })
      .click();
    await expect(page.locator(".agent-memory")).toHaveCount(2);
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    await page.locator(".agent-panel input[type=checkbox]").first().check();
    await page.locator(".agent-panel input[type=checkbox]").last().check();
    await page
      .getByRole("button", { name: "Save source permissions", exact: true })
      .click();
    await expect(page.locator(".agent-source-cache")).toContainText(
      "Currently approved",
    );
    const source = app.locals.agent.data.state.sources[0];
    const semantic = await post("/api/search", {
      sources: [{ id: source.id, name: source.name, pages: source.pages }],
      question: "Who remembered more vocabulary after a week?",
    });
    expect(semantic.mode).toBe("semantic");
    expect(semantic.citations.some((c: any) => c.page === 2)).toBe(true);
    evidence.semantic =
      "Real Qwen embeddings retrieved the experiment on page 2.";
    await page.getByRole("button", { name: "Tasks", exact: true }).click();
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page
      .getByLabel("Task name", { exact: true })
      .fill("Personal exam review");
    await page
      .getByRole("combobox", { name: "Reusable skill", exact: true })
      .selectOption("exam-prep");
    await page
      .getByLabel("What should I do?", { exact: true })
      .fill(
        "Use my saved quiz weaknesses and 25-minute preference. Search the learning experiment, save exactly 3 cited flashcards, update a seven-day study plan, and schedule one review in 24 hours.",
      );
    await page
      .getByLabel("Allow one follow-up review per run", { exact: true })
      .check();
    await page.getByRole("button", { name: "Run task", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Task queued");
    const task = app.locals.agent.data.state.tasks[0];
    const waitForRun = async (taskId: string) => {
      await expect
        .poll(
          () => {
            const run = app.locals.agent.data.state.runs.find(
              (r: any) => r.taskId === taskId,
            );
            if (run && ["failed", "cancelled"].includes(run.status))
              throw new Error(
                JSON.stringify({
                  status: run.status,
                  error: run.error,
                  steps: run.steps,
                }),
              );
            return run?.status;
          },
          { timeout: 190000, intervals: [2000] },
        )
        .toBe("completed");
      return app.locals.agent.data.state.runs.find(
        (r: any) => r.taskId === taskId,
      )!;
    };
    const run = await waitForRun(task.id);
    expect(
      run.materials.some(
        (m: any) => m.kind === "flashcards" && m.items.length >= 3,
      ),
    ).toBe(true);
    expect(run.sent.memories.some((m: any) => m.kind === "progress")).toBe(
      true,
    );
    const plan = app.locals.agent.data.state.plans.find(
      (p: any) => p.notebookId === source.notebookId,
    );
    expect(plan.text).toContain("25");
    const followups = app.locals.agent.data.state.tasks.filter(
      (t: any) => t.id !== task.id,
    );
    expect(followups).toHaveLength(1);
    expect(followups[0].allowSchedule).toBe(false);
    await post("/api/agent/task/action", {
      id: followups[0].id,
      action: "cancel",
    });
    evidence.agent = {
      status: run.status,
      calls: run.calls,
      tools: run.steps.map((s: any) => s.tool),
      citations: run.citations.map((c: any) => ({
        page: c.page,
        sourceName: c.sourceName,
      })),
      materialCount: run.materials.length,
      usedQuizMemory: true,
      personalizedPlan: true,
      followupScheduledAndCancelled: true,
    };
    await expect(page.locator("article.agent-result")).toBeVisible({
      timeout: 10000,
    });
    const material = run.materials.find((m: any) => m.kind === "flashcards");
    await page
      .getByText(`${material.title} · flashcards`, { exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save to Studio", exact: true })
      .click();
    await page.getByRole("button", { name: "Studio", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Saved study material", exact: true })
      .selectOption({ label: `${material.title} · flashcards` });
    await expect(page.locator(".flashcard")).toBeVisible();
    await post("/api/agent/task", {
      notebookId: source.notebookId,
      title: "Closed browser review",
      prompt:
        "Use my quiz weaknesses and search sources. Save exactly three cited quiz questions to practice weak topics. Do not schedule additional tasks.",
      skillId: "weak-topics",
      sourceIds: [source.id],
      dueAt: Date.now() + 4000,
    });
    const scheduledTask = app.locals.agent.data.state.tasks.find(
      (t: any) => t.title === "Closed browser review",
    )!;
    await page.close();
    const closedRun = await waitForRun(scheduledTask.id);
    expect(
      closedRun.sent.memories.some(
        (m: any) =>
          m.kind === "progress" && m.text.includes("Topics to revisit"),
      ),
    ).toBe(true);
    expect(
      closedRun.materials.some(
        (m: any) => m.kind === "quiz" && m.items.length >= 3,
      ),
    ).toBe(true);
    const next = await context.newPage();
    await next.goto("/");
    await next.getByRole("button", { name: "Agent", exact: true }).click();
    await expect(next.locator("article.agent-result")).toContainText(
      closedRun.answer.slice(0, 40),
      { timeout: 10000 },
    );
    evidence.browserClosed = {
      status: closedRun.status,
      tools: closedRun.steps.map((s: any) => s.tool),
      quizQuestions: closedRun.materials[0]?.items.length,
    };
    evidence.receipts = app.locals.agent.data.state.receipts;
    evidence.responseShapes = responseShapes;
    await expect(next.locator('[data-page="2"] canvas')).toBeVisible();
    await next.locator("article.agent-result").scrollIntoViewIfNeeded();
    await next.screenshot({
      path: "test-results/live-agent.png",
      fullPage: true,
    });
    writeFileSync(
      "test-results/live-evidence.json",
      JSON.stringify(evidence, null, 2),
    );
  } finally {
    app.locals.agent.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
      throw new Error("Unexpected test directory");
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live Nebius page-image questions and OCR", async ({ page }) => {
  test.skip(
    process.env.NEMODOC_LIVE !== "1",
    "Set NEMODOC_LIVE=1 to use real inference.",
  );
  test.setTimeout(180000);
  loadEnv({ quiet: true });
  expect(Boolean(process.env.NEBIUS_API_KEY)).toBe(true);
  const app = createApp({
    apiKey: process.env.NEBIUS_API_KEY!,
    baseUrl:
      process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1",
    model: process.env.NEBIUS_MODEL || "nvidia/Nemotron-3_5-Lightning",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const image = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 500;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 1000, 500);
      ctx.fillStyle = "black";
      ctx.font = "32px Arial";
      ctx.fillText("Learning experiment", 60, 80);
      ctx.fillText("Ada remembered 10 words after seven days.", 60, 160);
      ctx.fillText("Ben remembered 6 words after seven days.", 60, 240);
      return canvas.toDataURL("image/png");
    });
    const call = async (route: string, body: unknown) => {
      const response = await fetch(api + route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await response.json();
      expect(response.ok, JSON.stringify(value)).toBe(true);
      return value;
    };
    const vision = await call("/api/vision", {
      image,
      question: "How many words did Ada and Ben remember?",
    });
    expect(vision.content).toContain("10");
    expect(vision.content).toContain("6");
    const ocr = await call("/api/ocr", { image });
    expect(ocr.text).toContain("Ada");
    expect(ocr.text).toContain("10");
    expect(ocr.regions.length).toBeGreaterThan(0);
    const generated: Record<string, unknown> = {};
    for (const kind of ["guide", "flashcards", "mindmap"]) {
      const material = await call("/api/study", {
        kind,
        sources: [
          {
            id: "fixture",
            name: "Learning.pdf",
            pages: [
              "Spaced practice reviews material after one, three and seven days. Retrieval practice recalls an answer before opening notes. Study for 25 minutes then take a five-minute break. Ada recalled 10 of 12 words; Ben recalled 6. A small experiment cannot establish universal effectiveness.",
            ],
          },
        ],
      });
      expect(material.kind).toBe(kind);
      expect(material.citations.length).toBeGreaterThan(0);
      generated[kind] = {
        title: material.title,
        items: material.items.length,
        nodes: material.nodes?.length,
      };
    }
    writeFileSync(
      "test-results/live-vision-evidence.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          model: "openbmb/MiniCPM-V-4_5",
          vision: "Both fixture facts recognized",
          ocr: "Readable text and normalized regions returned",
          regions: ocr.regions.length,
          studyGeneration: generated,
        },
        null,
        2,
      ),
    );
  } finally {
    app.locals.agent.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
