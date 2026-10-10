import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
test("numbered-page Q&A calls chat with only that page; PDF slide returns stay local", async ({
  page,
}) => {
  let requests = 0;
  let sent:
    { sources: { id: string; name: string; pages: string[] }[] } | undefined;
  await page.route("**/api/chat", async (route) => {
    requests++;
    sent = route.request().postDataJSON();
    const source = sent!.sources[0];
    const citation = {
      id: 1,
      sourceId: source.id,
      sourceName: source.name,
      page: 3,
      text: source.pages[2].slice(0, 100),
    };
    await route.fulfill({
      contentType: "text/event-stream",
      body: `event: sources\ndata: ${JSON.stringify([citation])}\n\nevent: delta\ndata: ${JSON.stringify("This page explains the reading space and scrolling layouts. [1]")}\n\nevent: done\ndata: {}\n\n`,
    });
  });
  await page.goto("/");
  const ask = page.getByRole("textbox", { name: "Ask about your sources" });
  await ask.fill("Explain page 3");
  await ask.press("Enter");
  await expect(page.locator(".message.assistant").last()).toContainText(
    "This page explains the reading space",
  );
  await expect(page.locator(".supporting-page img")).toBeVisible();
  expect(requests).toBe(1);
  expect(sent!.sources).toHaveLength(1);
  expect(sent!.sources[0].pages.filter(Boolean)).toHaveLength(1);
  expect(sent!.sources[0].pages[2]).toContain("reading space");
  await ask.fill("Show slide 2");
  await ask.press("Enter");
  await expect(page.locator(".message.assistant").last()).toContainText(
    "Page 2",
  );
  await expect(page.locator(".supporting-page img").last()).toBeVisible();
  expect(requests).toBe(1);
});
test("local multi-page PDF previews, exact downloads, reload, ZIP and mobile", async ({
  page,
}) => {
  const providerRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(chat|vision)/.test(request.url()))
      providerRequests.push(request.url());
  });
  await page.goto("/");
  const pdf = await PDFDocument.create();
  for (const text of [
    "Introduction only",
    "Retrieval practice improves recall. Supporting evidence.",
    "Conclusion only",
  ])
    pdf.addPage([500, 700]).drawText(text, { x: 30, y: 600, size: 16 });
  await page.getByLabel("Upload sources", { exact: true }).setInputFiles({
    name: "Learning.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(
    page.getByRole("button", { name: /Learning PDF/ }),
  ).toBeVisible();
  const ask = page.getByRole("textbox", { name: "Ask about your sources" });
  await ask.fill("Return just page 2 from Learning.pdf");
  await ask.press("Enter");
  const card = page.locator(".supporting-page").last();
  await expect(card.locator("img")).toBeVisible();
  await expect(card).toContainText("Retrieval practice improves recall.");
  const pending = page.waitForEvent("download");
  await card
    .getByRole("button", { name: "Download single page (PDF)", exact: true })
    .click();
  const file = await pending;
  const bytes = await readFile((await file.path())!);
  expect(providerRequests).toEqual([]);
  const isolated = await PDFDocument.load(bytes);
  expect(isolated.getPageCount()).toBe(1);
  // Check actual text using the application's local PDF.js, not just the file label.
  const extracted = await page.evaluate(async (data) => {
    const { pdfjs, pdfOptions } = (await import(
      /* @vite-ignore */ String("/src/lib/documents.ts")
    )) as typeof import("../../src/lib/documents");
    const task = pdfjs.getDocument({
      data: new Uint8Array(data),
      ...pdfOptions,
    });
    const doc = await task.promise;
    const content = await (await doc.getPage(1)).getTextContent();
    await task.destroy();
    return content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
  }, Array.from(bytes));
  expect(extracted).toContain("Retrieval practice");
  expect(extracted).not.toContain("Introduction");
  await page.reload();
  await expect(page.locator(".supporting-page img")).toBeVisible();
  const backupPending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Notebook actions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back up notebook", exact: true })
    .click();
  const backup = await readFile((await (await backupPending).path())!);
  await page
    .getByLabel("Restore notebook backup", { exact: true })
    .setInputFiles({
      name: "backup.zip",
      mimeType: "application/zip",
      buffer: backup,
    });
  await expect(page.locator(".supporting-page img").last()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".supporting-page").last().scrollIntoViewIfNeeded();
  const bounds = await page.locator(".supporting-page").last().boundingBox();
  expect(bounds!.width).toBeLessThan(390);
  await page.screenshot({ path: "test-results/cited-page-mobile.png" });
  await ask.fill("Show page 99 from Learning.pdf");
  await ask.press("Enter");
  await expect(page.getByText(/has 3 pages/)).toBeVisible();
});
test("real PPTX slide preview and isolated PNG export", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("Upload sources", { exact: true })
    .setInputFiles("tests/fixtures/learning.pptx");
  const ask = page.getByRole("textbox", { name: "Ask about your sources" });
  await ask.fill("Show slide 2 from learning.pptx");
  await ask.press("Enter");
  const card = page.locator(".supporting-page").last();
  await expect(card.locator("img")).toBeVisible();
  await expect(card).toContainText("Recall without looking");
  const pending = page.waitForEvent("download");
  await card
    .getByRole("button", { name: "Download slide image (PNG)", exact: true })
    .click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe("learning-slide-2.png");
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await card
    .getByRole("button", { name: "Open in reader", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("2");
  await page.reload();
  await expect(page.locator(".supporting-page img")).toBeVisible();
  await page.screenshot({ path: "test-results/cited-slide.png" });
});
test("topic answer renders only validated cited pages and deduplicates evidence", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON();
    const s = body.sources[0];
    const text = s.pages[2];
    await route.fulfill({
      contentType: "text/event-stream",
      body: `event: sources\ndata: ${JSON.stringify([
        {
          id: 1,
          sourceId: s.id,
          sourceName: s.name,
          page: 3,
          text: text.slice(0, 80),
        },
        {
          id: 2,
          sourceId: s.id,
          sourceName: s.name,
          page: 3,
          text: text.slice(80, 150),
        },
        {
          id: 3,
          sourceId: s.id,
          sourceName: s.name,
          page: 4,
          text: s.pages[3],
        },
      ])}\n\nevent: delta\ndata: ${JSON.stringify("Supporting explanation [1, p.3] [2, p.3]")}\n\nevent: done\ndata: {}\n\n`,
    });
  });
  const ask = page.getByRole("textbox", { name: "Ask about your sources" });
  await ask.fill("Explain the reading interface and show supporting pages");
  await ask.press("Enter");
  await expect(page.locator(".supporting-page")).toHaveCount(1);
  await expect(page.locator(".supporting-page blockquote")).toHaveCount(2);
  await expect(page.locator(".supporting-page img")).toBeVisible();
  await expect(
    page.locator(".message.assistant").last().locator(".inline-citation"),
  ).toHaveCount(2);
});
