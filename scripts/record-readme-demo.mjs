import { chromium, expect } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const baseUrl = process.env.NEMODOC_DEMO_URL || "http://127.0.0.1:5173";
const demoDir = path.resolve("docs/demo");
const screenshotDir = path.resolve("docs/screenshots");
const outputDir = path.resolve("output");
await mkdir(outputDir, { recursive: true });
const tempDir = await mkdtemp(path.join(outputDir, "readme-demo-"));
const framesDir = path.join(tempDir, "frames");
await mkdir(framesDir, { recursive: true });
const mp4Path = path.join(demoDir, "nemodoc-mvp-tour.mp4");
const gifPath = path.join(demoDir, "nemodoc-mvp-tour.gif");

await mkdir(demoDir, { recursive: true });
await mkdir(screenshotDir, { recursive: true });

let browser;
let context;
let capturing = false;
let frameIndex = 0;
let captureFrames;
let captureStartedAt = 0;

try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        local: false,
        model: "nvidia/Nemotron-3_5-Lightning",
      },
    }),
  );
  await page.route("**/api/chat", (route) => {
    const request = route.request().postDataJSON();
    const selected = Boolean(request.selection);
    const citation = selected
      ? {
          id: 1,
          sourceId: "sample-paper",
          sourceName: "Designing for human attention.pdf",
          page: 2,
          text: "Every interface asks for a little of our attention. A notification, a toolbar, a choice: each carries a cost.",
        }
      : {
          id: 1,
          sourceId: "sample-paper",
          sourceName: "Designing for human attention.pdf",
          page: 5,
          text: "A thoughtful interface protects attention, supports agency, preserves context, and makes evidence easy to revisit.",
        };
    const answer = selected
      ? "This passage treats attention as a limited resource. A clear visual hierarchy and fewer interruptions help readers focus on the ideas that matter. [1]"
      : "The essay returns to four ideas: protect attention, give readers control, keep notes attached to their source, and make evidence easy to revisit. [1]";
    const body = [
      `event: sources\ndata: ${JSON.stringify([citation])}\n\n`,
      `event: delta\ndata: ${JSON.stringify(answer)}\n\n`,
      "event: done\ndata: {}\n\n",
    ].join("");
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });
  await page.route("**/api/study", (route) => {
    const { kind } = route.request().postDataJSON();
    return route.fulfill({
      json: {
        kind,
        title: "Attention, clarity & agency",
        content:
          "A thoughtful interface protects attention, supports reader agency, and keeps evidence close to the source.",
        items: [
          {
            question: "Why should an interface protect attention?",
            answer:
              "Attention is limited; clear hierarchy and fewer interruptions help readers focus.",
            citationIds: [1],
          },
          {
            question: "How can a reader verify an AI answer?",
            answer:
              "Follow its citation back to the source passage and judge the context directly.",
            citationIds: [1],
          },
        ],
        citations: [
          {
            id: 1,
            sourceId: "sample-paper",
            sourceName: "Designing for human attention.pdf",
            page: 2,
            text: "Every interface asks for a little of our attention. A notification, a toolbar, a choice: each carries a cost.",
          },
        ],
      },
    });
  });
  await page.route("**/api/agent", (route) =>
    route.fulfill({
      json: {
        version: 1,
        memories: [],
        skills: [
          {
            id: "exam-prep",
            name: "Exam preparation",
            instructions:
              "Turn approved source material into a focused study plan with cited topics and practice questions.",
          },
          {
            id: "weekly-briefing",
            name: "Weekly briefing",
            instructions:
              "Summarize progress and important themes from approved notebook sources.",
          },
        ],
        sources: [
          {
            id: "sample-paper",
            notebookId: "welcome",
            name: "Designing for human attention.pdf",
            pages: [
              "Attention is limited. A thoughtful interface protects attention and supports agency.",
            ],
            kind: "document",
          },
        ],
        tasks: [],
        runs: [],
        plans: [],
        receipts: [],
      },
    }),
  );
  await page.route("**/api/agent/connections", (route) =>
    route.fulfill({
      json: {
        model: {
          mode: "notebook",
          baseUrl: "https://api.tokenfactory.nebius.com/v1/",
          model: "nvidia/Nemotron-3_5-Lightning",
          hasApiKey: true,
          tested: true,
        },
        email: {
          smtpHost: "",
          smtpPort: 465,
          smtpSecurity: "tls",
          smtpUser: "",
          from: "",
          recipient: "",
          hasPassword: false,
          revision: "",
        },
        whatsapp: {
          phoneNumberId: "",
          recipient: "",
          apiVersion: "v23.0",
          templateName: "",
          language: "en_US",
          hasApiKey: false,
          revision: "",
        },
      },
    }),
  );

  await page.goto(baseUrl);
  await expect(
    page.getByRole("heading", { name: "The thoughtful interface" }),
  ).toBeVisible();
  await page.waitForTimeout(1500);

  capturing = true;
  captureStartedAt = Date.now();
  captureFrames = (async () => {
    while (capturing) {
      const name = `frame-${String(frameIndex).padStart(5, "0")}.jpg`;
      frameIndex += 1;
      await page.screenshot({
        path: path.join(framesDir, name),
        type: "jpeg",
        quality: 82,
      });
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
  })();

  const pageNumber = page.getByRole("textbox", {
    name: "Page number",
    exact: true,
  });
  await pageNumber.fill("2");
  await pageNumber.press("Enter");
  await expect(page.locator('[data-page="2"] canvas')).toBeVisible();
  await page.getByRole("button", { name: "Reader tools" }).click();
  await page.waitForTimeout(900);
  for (const mode of ["Horizontal view", "Book view", "Vertical view"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page.waitForTimeout(1050);
  }
  await page.screenshot({ path: path.join(screenshotDir, "reader.png") });

  const passage = page
    .locator('[data-page="2"] .textLayer span')
    .filter({ hasText: "Every interface asks" })
    .first();
  await expect(passage).toBeVisible();
  await passage.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.locator(".page-scroller").dispatchEvent("mouseup");
  const toolbar = page.getByRole("toolbar", { name: "Selected text actions" });
  await expect(toolbar).toBeVisible();
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(screenshotDir, "selection-tools.png") });
  await toolbar.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: /Highlights/ }).click();
  await expect(page.locator(".notes-scroll")).toContainText(
    "Every interface asks",
  );
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(screenshotDir, "highlights.png") });

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await passage.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.locator(".page-scroller").dispatchEvent("mouseup");
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "Explain", exact: true }).click();

  const assistant = page.getByRole("complementary", {
    name: "Notebook assistant",
  });
  await expect(assistant).toBeVisible();
  await expect(assistant.locator(".message.assistant")).toContainText(
    "attention as a limited resource",
  );
  await page.waitForTimeout(1900);
  await page.screenshot({ path: path.join(screenshotDir, "chat.png") });
  await page.screenshot({ path: path.join(demoDir, "mvp-tour-preview.png") });

  await assistant.getByRole("button", { name: "Add to Notes" }).click();
  await expect(assistant.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: /Answers/ }).click();
  await expect(page.locator(".saved-answer-list")).toContainText(
    "attention as a limited resource",
  );
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(screenshotDir, "notes.png") });

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  const notebookChat = page.getByRole("textbox", {
    name: "Ask about your sources",
    exact: true,
  });
  await notebookChat.fill("What ideas connect the essay?");
  await notebookChat.press("Enter");
  await expect(assistant.locator(".message.assistant").last()).toContainText(
    "four ideas",
  );
  await page.waitForTimeout(1800);

  await page.getByRole("button", { name: "Notebook actions" }).click();
  await expect(page.getByRole("button", { name: "Export notes" })).toBeVisible();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(screenshotDir, "export-notes.png") });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Flashcards", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Attention, clarity & agency" })).toBeVisible();
  await page.waitForTimeout(1900);
  await page.screenshot({ path: path.join(screenshotDir, "studio.png") });

  await page.getByRole("button", { name: "Agent", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your personal agent" })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(screenshotDir, "personal-agent.png") });
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await expect(page.locator(".agent-skill").first()).toContainText(
    "Exam preparation",
  );
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(screenshotDir, "agent-skills.png") });
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Model & delivery connections" }),
  ).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({
    path: path.join(screenshotDir, "agent-connections.png"),
  });
  const modelConnection = page.getByLabel("Model connection");
  await modelConnection.selectOption("custom");
  await page.getByRole("button", { name: "Use local Gemma 4 / Ollama" }).click();
  await page.waitForTimeout(900);
  await page.screenshot({
    path: path.join(screenshotDir, "agent-open-model.png"),
  });
  await modelConnection.selectOption("notebook");
  await page
    .getByRole("button", { name: "Test saved SMTP connection" })
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({
    path: path.join(screenshotDir, "agent-email-setup.png"),
  });
  await page
    .getByRole("heading", { name: "WhatsApp Business" })
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({
    path: path.join(screenshotDir, "agent-whatsapp.png"),
  });
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await expect(page.getByLabel("What should I do?")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, "agent-task.png") });
  await page.getByLabel("Repeat").selectOption("weekdays");
  await page.getByLabel("Schedule time zone").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(screenshotDir, "agent-schedule.png") });

  capturing = false;
  await captureFrames;
  const captureSeconds = (Date.now() - captureStartedAt) / 1000;
  const captureFps = frameIndex / captureSeconds;
  console.log(`Recorded ${frameIndex} frames over ${captureSeconds.toFixed(1)}s.`);
  await context.close();
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      captureFps.toFixed(3),
      "-i",
      path.join(framesDir, "frame-%05d.jpg"),
      "-an",
      "-vf",
      "fps=25,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "25",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4Path,
    ],
    { stdio: "inherit" },
  );
  const palettePath = path.join(tempDir, "palette.png");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      mp4Path,
      "-vf",
      "fps=10,scale=800:-2:flags=lanczos,palettegen",
      palettePath,
    ],
    { stdio: "inherit" },
  );
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      mp4Path,
      "-i",
      palettePath,
      "-filter_complex",
      "fps=10,scale=800:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer",
      gifPath,
    ],
    { stdio: "inherit" },
  );
  console.log(`Created ${mp4Path} and ${gifPath}`);
} finally {
  capturing = false;
  await captureFrames?.catch(() => {});
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await rm(tempDir, { recursive: true, force: true });
}
