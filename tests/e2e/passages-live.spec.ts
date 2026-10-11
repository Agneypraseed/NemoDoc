import { test, expect } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/app.ts";
import { SettingsStore } from "../../server/settings.ts";
import { providerKind } from "../../server/providers.ts";

test("live Nebius defines the selected MML Rank with its page context in Quick and Deep", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.NEMODOC_PASSAGE_LIVE !== "1",
    "Explicitly opt in to billable inference with NEMODOC_PASSAGE_LIVE=1.",
  );
  test.setTimeout(300000);
  loadEnv({ quiet: true });
  const book = path.resolve(
    process.env.NEMODOC_MML_BOOK || "data/mml-book.pdf",
  );
  expect(existsSync(book)).toBe(true);
  // Verified against the authors' public https://mml-book.github.io/book/mml-book.pdf.
  // This specific live test must never transmit an arbitrary local/private PDF.
  expect(createHash("sha256").update(readFileSync(book)).digest("hex")).toBe(
    "3f87b70c64a35d30ec4e565b4d5cfd18fe913002d3b3bed44691c7d0838911bc",
  );
  const settings = new SettingsStore(
    {
      apiKey: process.env.NEBIUS_API_KEY || "",
      baseUrl:
        process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1",
      model: process.env.NEBIUS_MODEL || "nvidia/Nemotron-3_5-Lightning",
    },
    path.resolve("data/settings.json"),
  ).value;
  expect(providerKind(settings.baseUrl)).toBe("nebius");
  expect(!!settings.apiKey).toBe(true);
  const requests: any[] = [];
  const receipts: {
    status: number;
    model: string;
    responseId?: string;
    returnedModel?: string;
    thinkingDisabled: boolean;
  }[] = [];
  const inspections: Promise<void>[] = [];
  const realFetch = (async (url, init) => {
    const payload = JSON.parse(String(init?.body));
    const response = await fetch(url, init);
    const receipt = {
      status: response.status,
      model: payload.model,
      thinkingDisabled: payload.chat_template_kwargs?.enable_thinking === false,
    } as (typeof receipts)[number];
    receipts.push(receipt);
    inspections.push(
      response
        .clone()
        .text()
        .then((body) => {
          const first = body
            .split("\n")
            .find((line) => line.startsWith("data:") && line.includes('"id"'));
          if (first) {
            const data = JSON.parse(first.slice(5));
            receipt.responseId = data.id;
            receipt.returnedModel = data.model;
          }
        }),
    );
    return response;
  }) as typeof fetch;
  mkdirSync("output/passage-fix", { recursive: true });
  const server = createApp(settings, realFetch).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Forward to the real backend and provider, preserving their response bodies.
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname === "/api/chat")
      requests.push(request.postDataJSON());
    const response = await fetch(api + new URL(request.url()).pathname, {
      method: request.method(),
      headers: { "Content-Type": "application/json" },
      body: request.postData() || undefined,
    });
    await route.fulfill({
      status: response.status,
      contentType: response.headers.get("content-type") || "application/json",
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "New notebook", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Notebook title" })
      .fill("Mathematics for Machine Learning");
    await page
      .getByRole("button", { name: "Create notebook", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Mathematics for Machine Learning",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Upload sources", { exact: true })
      .setInputFiles(book);
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible({
      timeout: 120000,
    });
    const answers: Record<string, string> = {};
    for (const [index, mode] of ["Quick", "Deep"].entries()) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      const number = page.getByRole("textbox", {
        name: "Page number",
        exact: true,
      });
      await number.fill("53");
      await number.press("Enter");
      const rank = page
        .locator('[data-page="53"] .textLayer span')
        .filter({ hasText: /Rank/ })
        .first();
      await expect(rank).toBeVisible();
      await rank.evaluate((element) => {
        const node = element.firstChild!;
        const start = node.textContent!.indexOf("Rank");
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + 4);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await page.locator(".page-scroller").dispatchEvent("mouseup");
      await page
        .getByRole("toolbar", { name: "Selected text actions" })
        .getByRole("button", { name: "Define", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Send question", exact: true }),
      ).toBeVisible({ timeout: 120000 });
      await expect(page.locator(".message.assistant")).toHaveCount(index + 1);
      const answer = await page
        .locator(".message.assistant")
        .last()
        .innerText();
      writeFileSync(
        `output/passage-fix/live-${mode.toLowerCase()}.txt`,
        answer,
      );
      expect(answer).toMatch(/rank/i);
      expect(answer).toMatch(/independent|dimension/i);
      expect(answer).not.toMatch(
        /thinking process|Analyze User Input|<think>|Let me think|\\mathbb|\\mathrm/i,
      );
      await expect(
        page.locator(".message.assistant").last().locator(".katex-error"),
      ).toHaveCount(0);
      await expect(
        page.locator(".message.assistant").last().locator(".inline-citation"),
      ).not.toHaveCount(0);
      expect(requests[index].selection).toMatchObject({
        page: 53,
        quote: "Rank",
      });
      expect(requests[index].answerMode).toBe(mode.toLowerCase());
      answers[mode] = answer;
    }
    await Promise.all(inspections);
    expect(receipts).toHaveLength(2);
    for (const receipt of receipts) {
      expect(receipt.status).toBe(200);
      expect(receipt.thinkingDisabled).toBe(true);
      expect(receipt.responseId).toBeTruthy();
      expect(receipt.model).toBe(settings.model);
    }
    writeFileSync(
      "output/passage-fix/live-receipts.json",
      JSON.stringify(
        {
          receipts,
          selectedPage: 53,
          answerCharacters: Object.fromEntries(
            Object.entries(answers).map(([mode, answer]) => [
              mode,
              answer.length,
            ]),
          ),
        },
        null,
        2,
      ),
    );
    const handle = page.getByRole("button", { name: "Move answer card" });
    await handle.press("ArrowLeft");
    await handle.press("ArrowUp");
    // The selected heading can sit just below the previous page's visible edge.
    // Follow a real answer citation so the screenshot shows its original page.
    await page
      .locator(".message.assistant")
      .last()
      .locator(".inline-citation")
      .first()
      .click();
    await expect(
      page.getByRole("textbox", { name: "Page number", exact: true }),
    ).toHaveValue("53");
    await page.locator('[data-page="53"]').scrollIntoViewIfNeeded();
    await page.locator(".chat-scroll").evaluate((element) => {
      element.scrollTop = 0;
    });
    await handle.evaluate((element: HTMLElement) => element.blur());
    await page.screenshot({
      path: "output/passage-fix/live-rank.png",
      fullPage: true,
    });
  } finally {
    await Promise.all(inspections);
    writeFileSync(
      "output/passage-fix/live-provider-receipts.json",
      JSON.stringify(receipts, null, 2),
    );
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
