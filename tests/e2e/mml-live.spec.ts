import { test, expect } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { PDFDocument } from "pdf-lib";
import { createApp } from "../../server/app.ts";

// Real billable inference. The browser proxy forwards the actual server response.
// No provider, answer, citation, source import, preview, or download is mocked.
test("real Nemotron answers and exports supporting MML book pages", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.NEMODOC_MML_LIVE !== "1",
    "Opt in with NEMODOC_MML_LIVE=1 and supply the MML book locally.",
  );
  test.setTimeout(360000);
  loadEnv({ quiet: true });
  const book = path.resolve(
    process.env.NEMODOC_MML_BOOK || "data/mml-book.pdf",
  );
  expect(existsSync(book)).toBe(true);
  expect(Boolean(process.env.NEBIUS_API_KEY)).toBe(true);
  const model = process.env.NEBIUS_MODEL || "nvidia/Nemotron-3_5-Lightning";
  expect(model).toMatch(/nemotron/i);
  const dir = mkdtempSync(path.join(tmpdir(), "nemodoc-mml-"));
  mkdirSync("test-results", { recursive: true });
  const receipts: {
    endpoint: string;
    requestedModel: string;
    status: number;
    responseId?: string;
    returnedModel?: string;
  }[] = [];
  const collected: Promise<void>[] = [];
  const realFetch = (async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (body) expect(body.model).toMatch(/nemotron/i);
    const response = await fetch(url, init);
    if (body) {
      const receipt = {
        endpoint: String(url),
        requestedModel: body.model,
        status: response.status,
      } as (typeof receipts)[number];
      receipts.push(receipt);
      collected.push(
        response
          .clone()
          .text()
          .then((text) => {
            const first = text
              .split("\n")
              .find(
                (line) => line.startsWith("data:") && line.includes('"id"'),
              );
            const json = first ? JSON.parse(first.slice(5)) : JSON.parse(text);
            receipt.responseId = json.id;
            receipt.returnedModel = json.model;
          }),
      );
    }
    return response;
  }) as typeof fetch;
  const app = createApp(
    {
      apiKey: process.env.NEBIUS_API_KEY!,
      baseUrl:
        process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1",
      model,
    },
    realFetch,
    { agentFile: path.join(dir, "agent.json") },
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await context.route("**/api/**", async (route) => {
    const req = route.request();
    const response = await fetch(api + new URL(req.url()).pathname, {
      method: req.method(),
      headers: { "Content-Type": "application/json" },
      body: req.postData() || undefined,
    });
    await route.fulfill({
      status: response.status,
      contentType: response.headers.get("content-type") || "application/json",
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  const extract = async (bytes: Buffer, number: number) =>
    page.evaluate(
      async ({ data, number }) => {
        const { pdfjs, pdfOptions } = (await import(
          /* @vite-ignore */ String("/src/lib/documents.ts")
        )) as typeof import("../../src/lib/documents");
        const task = pdfjs.getDocument({
          data: Uint8Array.from(atob(data), (character) =>
            character.charCodeAt(0),
          ),
          ...pdfOptions,
        });
        try {
          const doc = await task.promise;
          const content = await (await doc.getPage(number)).getTextContent();
          return content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ");
        } finally {
          await task.destroy();
        }
      },
      { data: bytes.toString("base64"), number },
    );
  try {
    const catalog = await (await fetch(api + "/api/models")).json();
    expect(catalog.models).toContain(model);
    expect(catalog.models.every((id: string) => /nemotron/i.test(id))).toBe(
      true,
    );
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
    // Creation persists asynchronously. Wait for the new notebook before upload.
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
    const bytes = await readFile(book);
    const original = await PDFDocument.load(bytes);
    const question =
      "Explain principal component analysis (PCA), its dimensionality reduction objective and variance maximization in at most 140 words. Cite the relevant book passages.";
    const ask = page.getByRole("textbox", { name: "Ask about your sources" });
    await ask.fill(question);
    await ask.press("Enter");
    const answer = page.locator(".message.assistant").last();
    await expect(answer.locator(".inline-citation").first()).toBeVisible({
      timeout: 150000,
    });
    await expect(
      page.getByRole("button", { name: "Stop answer", exact: true }),
    ).toBeHidden({ timeout: 30000 });
    await expect(answer).toContainText(/variance|dimensionality/i);
    const answerText = await answer.innerText();
    await answer.locator(".inline-citation").first().click();
    const citedPage = Number(
      await page
        .getByRole("textbox", { name: "Page number", exact: true })
        .inputValue(),
    );
    expect(await extract(bytes, citedPage)).toMatch(/principal component|PCA/i);
    await answer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/mml-answer.png" });

    const downloadQuestion =
      "Return just the supporting pages about principal component analysis (PCA), variance maximization and dimensionality reduction so I can download them. Reply with one short sentence and the most relevant citation IDs only.";
    await ask.fill(downloadQuestion);
    await ask.press("Enter");
    const downloadAnswer = page.locator(".message.assistant").last();
    await expect(
      downloadAnswer.locator(".supporting-page img").first(),
    ).toBeVisible({ timeout: 150000 });
    await expect(
      page.getByRole("button", { name: "Stop answer", exact: true }),
    ).toBeHidden({ timeout: 30000 });
    const cards = downloadAnswer.locator(".supporting-page");
    const exports: {
      page: number;
      filename: string;
      exactTextMatch: boolean;
      pageCount: number;
    }[] = [];
    for (const card of await cards.all()) {
      const label = await card.locator("strong").innerText();
      const number = Number(label.match(/Page (\d+)/)![1]);
      expect(await card.locator("blockquote").count()).toBeGreaterThan(0);
      const before = receipts.length;
      const pending = page.waitForEvent("download");
      await card
        .getByRole("button", {
          name: "Download single page (PDF)",
          exact: true,
        })
        .click();
      const download = await pending;
      const filename = download.suggestedFilename();
      await download.saveAs(path.join("test-results", filename));
      const exported = await readFile((await download.path())!);
      const doc = await PDFDocument.load(exported);
      expect(doc.getPageCount()).toBe(1);
      const exportText = await extract(exported, 1);
      const sourceText = await extract(bytes, number);
      expect(exportText).toBe(sourceText);
      expect(sourceText).toMatch(/principal component|PCA/i);
      expect(receipts.length).toBe(before);
      exports.push({
        page: number,
        filename,
        exactTextMatch: true,
        pageCount: 1,
      });
    }
    await cards
      .first()
      .getByRole("button", { name: "Open in reader", exact: true })
      .click();
    await page.setViewportSize({ width: 1440, height: 1400 });
    await cards.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/mml-supporting-pages.png" });
    await Promise.all(collected);
    expect(receipts).toHaveLength(2);
    for (const receipt of receipts) {
      expect(receipt.status).toBe(200);
      expect(receipt.responseId).toBeTruthy();
      expect(receipt.returnedModel).toMatch(/nemotron/i);
    }
    writeFileSync(
      "test-results/mml-live-evidence.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          provider: "Nebius Token Factory",
          model,
          catalog: catalog.models,
          originalPageCount: original.getPageCount(),
          question,
          answerText,
          citedPage,
          downloadQuestion,
          downloadAnswer: await downloadAnswer.innerText(),
          exports,
          receipts,
          allCallsNemotron: true,
          downloadsMadeNoInferenceCalls: true,
        },
        null,
        2,
      ),
    );
    await page.reload();
    await expect(page.locator(".supporting-page img").first()).toBeVisible({
      timeout: 30000,
    });
  } finally {
    app.locals.agent.stop();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    if (!path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep))
      throw new Error("Unexpected temp path");
    rmSync(dir, { recursive: true, force: true });
  }
});
