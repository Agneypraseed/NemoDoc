import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";

test("PDF reader layouts, selection, notes, persistence, search, and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The thoughtful interface" }),
  ).toBeVisible();
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png" });
  await page
    .getByRole("button", { name: "Horizontal view", exact: true })
    .click();
  await expect(page.locator(".page-scroller")).toHaveClass(/horizontal/);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("2");
  await page.getByRole("button", { name: "Book view", exact: true }).click();
  await expect(page.locator(".document-page")).toHaveCount(2);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator('[data-page="3"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Vertical view", exact: true })
    .click();
  const pageNumber = page.getByRole("textbox", {
    name: "Page number",
    exact: true,
  });
  await pageNumber.fill("2");
  await pageNumber.press("Enter");
  const text = page
    .locator('[data-page="2"] .textLayer span')
    .filter({ hasText: "Every interface" })
    .first();
  await expect(text).toBeVisible();
  await text.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator(".page-scroller").dispatchEvent("mouseup");
  await expect(
    page.getByRole("toolbar", { name: "Selected text actions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await expect(page.locator(".annotation-card")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Annotation note" })
    .fill("A finite resource worth protecting.");
  await page
    .getByRole("textbox", { name: "Notebook notes", exact: true })
    .fill("My research notes.");
  await page.reload();
  await page.getByRole("button", { name: /^Notes/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Annotation note" }),
  ).toHaveValue("A finite resource worth protecting.");
  await expect(
    page.getByRole("textbox", { name: "Notebook notes", exact: true }),
  ).toHaveValue("My research notes.");
  await page
    .getByRole("button", { name: "Find in document", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search document text" })
    .fill("retrieval");
  await page.locator(".search-results button").first().click();
  await expect(pageNumber).toHaveValue("5");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notes", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/notes.md$/);
  expect(errors).toEqual([]);
});

test("real PDF and PowerPoint uploads persist in a new notebook", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New notebook", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Notebook title" })
    .fill("My reading list");
  await page
    .getByRole("button", { name: "Create notebook", exact: true })
    .click();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Actual uploaded PDF with selectable text.", {
    x: 50,
    y: 700,
    size: 20,
    font,
  });
  await page.getByLabel("Upload sources", { exact: true }).setInputFiles({
    name: "Research.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(
    page.getByRole("button", { name: /Research PDF/ }),
  ).toBeVisible();
  await expect(
    page.locator(".textLayer span").filter({ hasText: "Actual uploaded PDF" }),
  ).toBeVisible();
  const zip = new JSZip();
  zip.file(
    "ppt/presentation.xml",
    '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldSz cx="12192000" cy="6858000"/><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>',
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>',
  );
  zip.file(
    "ppt/slides/slide1.xml",
    '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="10000000" cy="2000000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:rPr sz="3200" b="1"/><a:t>Real PowerPoint slide title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
  );
  await page.getByLabel("Upload sources", { exact: true }).setInputFiles({
    name: "Ideas.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await expect(page.locator(".slide-render")).toContainText(
    "Real PowerPoint slide title",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My reading list" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Ideas PPTX/ }).click();
  await expect(page.locator(".slide-render")).toContainText(
    "Real PowerPoint slide title",
  );
});

test("streamed grounded chat shows citations that navigate back to the page", async ({
  page,
}) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: 'event: sources\ndata: [{"id":1,"sourceId":"sample-paper","sourceName":"Designing for human attention.pdf","page":3,"text":"Vertical scrolling supports continuous reading."}]\n\nevent: delta\ndata: "Vertical scrolling supports continuous reading. [1]"\n\nevent: done\ndata: {}\n\n',
    }),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Ask about your sources", exact: true })
    .fill("Which reading modes are available?");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(page.locator(".message.assistant")).toContainText(
    "Vertical scrolling",
  );
  await page.locator(".inline-citation").click();
  await expect(
    page.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("3");
  await page.reload();
  await expect(page.locator(".message.assistant")).toContainText(
    "Vertical scrolling",
  );
});

test("area annotations work on the cover and mobile reader remains usable", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator('[data-page="1"] canvas');
  await expect(canvas).toBeVisible();
  await page
    .getByRole("button", { name: "Area highlight", exact: true })
    .click();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + 40, bounds.y + 110);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 190, bounds.y + 160, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".annotation-card")).toContainText(
    "Area highlight",
  );
  await page
    .getByRole("textbox", { name: "Annotation note" })
    .fill("An image annotation.");
  await page.getByRole("button", { name: "Book view", exact: true }).click();
  await expect(page.locator(".highlight")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Hide assistant", exact: true })
    .click();
  await expect(page.locator(".reader")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png" });
  await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add source", exact: true }).first(),
  ).toBeVisible();
});
