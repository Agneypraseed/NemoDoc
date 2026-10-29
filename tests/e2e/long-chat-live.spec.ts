import { test, expect } from "@playwright/test";
import express from "express";
import { parse } from "dotenv";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createApp } from "../../server/app.ts";
import { SettingsStore } from "../../server/settings.ts";
import { DEFAULT_CONVERSATION_PROMPTS } from "../../src/conversation-prompt-types";

test("live long chat completes and renders continued Quick and Deep answers", async ({
  browser,
}) => {
  test.skip(
    process.env.NEMODOC_LONG_CHAT_LIVE !== "1",
    "Explicit opt-in required for live inference.",
  );
  test.setTimeout(420000);
  const env = existsSync(".env") ? parse(readFileSync(".env")) : process.env;
  const nebius = !!env.NEBIUS_API_KEY;
  const settings = new SettingsStore(
    {
      apiKey: env.NEBIUS_API_KEY || env.NVIDIA_API_KEY || "",
      baseUrl: nebius
        ? env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1"
        : env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
      model: nebius
        ? env.NEBIUS_MODEL || "nvidia/Nemotron-3_5-Lightning"
        : env.NVIDIA_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
    },
    path.resolve("data/settings.json"),
  ).value;
  expect(!!settings.apiKey, "Configure the existing Nemotron connection.").toBe(
    true,
  );
  const directory = mkdtempSync(path.resolve("output/long-chat-live-"));
  const receipts: {
    status: number;
    model: string;
    maxTokens: number;
    continued: boolean;
    finishReasons: string[];
    completionTokens?: number;
    elapsedMs?: number;
  }[] = [];
  const inspections: Promise<void>[] = [];
  const observedFetch: typeof fetch = async (url, init) => {
    const payload = JSON.parse(String(init?.body));
    const started = Date.now();
    const response = await fetch(url, init);
    const receipt: (typeof receipts)[number] = {
      status: response.status,
      model: payload.model,
      maxTokens: payload.max_tokens,
      continued: payload.messages
        .at(-1)
        .content.startsWith("Continue the unfinished answer"),
      finishReasons: [],
    };
    receipts.push(receipt);
    inspections.push(
      response
        .clone()
        .text()
        .then((body) => {
          for (const line of body.split("\n")) {
            if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
            try {
              const event = JSON.parse(line.slice(5));
              const reason = event.choices?.[0]?.finish_reason;
              if (reason) receipt.finishReasons.push(reason);
              if (event.usage?.completion_tokens)
                receipt.completionTokens = event.usage.completion_tokens;
            } catch {
              /* Receipts must not affect live streaming. */
            }
          }
          receipt.elapsedMs = Date.now() - started;
        }),
    );
    return response;
  };
  const app = createApp(settings, observedFetch, {
    agentFile: path.join(directory, "agent.json"),
    workspaceFile: path.join(directory, "workspace.json"),
    traceSpoolFile: path.join(directory, "traces.jsonl"),
    startWorkspaceWorker: false,
  });
  app.use(express.static(path.resolve("dist")));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  await app.locals.workspace.ready;
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const results: object[] = [];
  const requests: { question: string; answerMode: string }[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/chat")
      requests.push(request.postDataJSON());
  });
  try {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const source =
      "PUBLIC SYNTHETIC SOFTWARE TEST. The Lumen notebook stores notes locally. A notebook has a title, description, sources, and conversation. Source selection determines eligible evidence; retrieval chooses relevant excerpts, not the entire book. Citations identify the source and PDF page. A draft is saved only after confirmation. Cancellation keeps existing notes. Atomic writes preserve the whole previous version if a write fails. A backup copies notes and source files. Restore validates the archive before writing. Users choose a notebook before opening it. Quick normally gives concise answers. Deep gives structured detail. Prompts can be customized separately. Interrupted answers preserve partial text and cannot be saved as completed. A complete answer can be saved to Notes. Deleting a source preserves archived passage notes but makes original source links unavailable. Verification uses isolated synthetic data. These are fictional requirements for a test, not claims about any real product.";
    const sheet = pdf.addPage();
    sheet.drawText(source, {
      x: 45,
      y: 750,
      size: 12,
      font,
      maxWidth: 500,
      lineHeight: 20,
    });
    const file = path.join(directory, "synthetic-guide.pdf");
    writeFileSync(file, await pdf.save());
    await page.goto(origin + "/notebooks");
    await page
      .getByRole("button", { name: "Create notebook", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "New notebook",
      exact: true,
    });
    await dialog
      .getByRole("textbox", { name: "Notebook title", exact: true })
      .fill("Live long answer check");
    await dialog
      .getByRole("button", { name: "Create notebook", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Live long answer check",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Upload sources", { exact: true })
      .setInputFiles(file);
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible({
      timeout: 30000,
    });
    // Exercise the public prompt editor to stress Quick's 1024-token segments.
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settingsDialog = page.getByRole("dialog", {
      name: "Settings",
      exact: true,
    });
    await settingsDialog
      .getByRole("button", { name: "Conversation", exact: true })
      .click();
    await settingsDialog
      .getByRole("textbox", { name: "Quick system prompt", exact: true })
      .fill(DEFAULT_CONVERSATION_PROMPTS.deep);
    await settingsDialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    const topics = [
      "local notes",
      "notebook identity",
      "source selection",
      "retrieval",
      "citations",
      "draft confirmation",
      "cancellation",
      "atomic writes",
      "backups",
      "restore validation",
      "opening notebooks",
      "Quick answers",
      "Deep answers",
      "custom prompts",
      "interruption",
      "saving answers",
      "source deletion",
      "archived notes",
      "unavailable links",
      "synthetic verification",
      "evidence scope",
      "preserving content",
      "user control",
      "recovery",
      "source navigation",
      "request planning",
      "answer structure",
      "final review",
      "failure handling",
      "completion",
    ];
    for (const mode of ["quick", "deep"] as const) {
      const count = mode === "quick" ? 14 : 30;
      const question =
        `Explain the supplied fictional Lumen notebook guide in ${count} numbered Markdown sections. Write 85-100 words per section, as a substantial training manual. Use only supported facts; distinguish illustrative implications from direct facts. Cite each section. Do not summarize away requested sections. Finish with the exact text END OF LONG ANSWER on its own line.\n\n` +
        topics
          .slice(0, count)
          .map(
            (topic, i) =>
              `${i + 1}. Discuss ${topic}: explain the supported behavior and its purpose, relate it to user control and preserving source context, and give a clearly labelled illustrative workflow. Keep citations and complete this section.`,
          )
          .join("\n");
      expect(question.length).toBeLessThanOrEqual(8000);
      const start = receipts.length;
      await page
        .getByRole("group", { name: "Answer detail" })
        .getByRole("button", {
          name: mode === "quick" ? "Quick" : "Deep",
          exact: true,
        })
        .click();
      const input = page.getByRole("textbox", {
        name: "Ask about your sources",
        exact: true,
      });
      await input.fill(question);
      const began = Date.now();
      await input.press("Enter");
      const answer = page.locator(".message.assistant").last();
      await expect(
        answer.getByRole("button", { name: "Save to Notes", exact: true }),
      ).toBeVisible({ timeout: 130000 });
      const content = await answer.innerText();
      writeFileSync(path.join(directory, `${mode}-answer.txt`), content);
      await expect(answer).toContainText("END OF LONG ANSWER");
      expect(content.length).toBeGreaterThan(mode === "quick" ? 5000 : 10000);
      expect(receipts.slice(start).every((r) => r.status === 200)).toBe(true);
      expect(requests.at(-1)).toMatchObject({ question, answerMode: mode });
      expect(await page.locator(".message-question").last().textContent()).toBe(
        question,
      );
      await answer
        .getByText("END OF LONG ANSWER", { exact: false })
        .last()
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(directory, `${mode}-desktop.png`),
      });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await answer.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await answer
        .getByText("END OF LONG ANSWER", { exact: false })
        .last()
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(directory, `${mode}-mobile.png`),
      });
      results.push({
        mode,
        promptCharacters: question.length,
        answerCharacters: content.length,
        elapsedMs: Date.now() - began,
        calls: receipts.length - start,
      });
      await page.reload();
      await expect(page.locator(".message.assistant").last()).toContainText(
        "END OF LONG ANSWER",
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await Promise.all(inspections);
    expect(receipts.some((r) => r.continued && r.maxTokens === 1024)).toBe(
      true,
    );
    expect(
      receipts.filter((r) => r.maxTokens === 1024).at(-1)?.finishReasons,
    ).toContain("stop");
    expect(
      receipts.filter((r) => r.maxTokens === 4096).at(-1)?.finishReasons,
    ).toContain("stop");
  } finally {
    await Promise.allSettled(inspections);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, "summary.json"),
      JSON.stringify({ results, receipts }, null, 2),
    );
    console.log(
      "Live chat evidence:",
      directory,
      JSON.stringify({ results, receipts }),
    );
    await context.close();
    app.locals.workspace.worker.stop();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await app.locals.workspace.repository.close();
    await app.locals.workspace.traces.close();
  }
});
