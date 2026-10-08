import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, PDFName, PDFString } from "pdf-lib";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

test("reader navigation, bookmarks, markup history, tags, exports and complete restore", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  await page
    .getByRole("button", { name: "Toggle page navigation", exact: true })
    .click();
  await expect(page.locator(".page-thumbnail")).toHaveCount(6);
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("2");
  await page
    .getByRole("button", { name: "Bookmark current page", exact: true })
    .click();
  await page.getByRole("button", { name: "Bookmarks", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Go to page 2", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Toggle page navigation", exact: true })
    .click();
  const text = page
    .locator('[data-page="2"] .textLayer span')
    .filter({ hasText: "Every interface" })
    .first();
  await expect(text).toBeVisible();
  await text.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator(".page-scroller").dispatchEvent("mouseup");
  await page.getByRole("button", { name: "Underline", exact: true }).click();
  await page.getByRole("button", { name: /^Notes/ }).click();
  await expect(page.locator(".annotation-card")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Annotation note", exact: true })
    .fill("Unicode comment: 学習 café");
  await page
    .getByRole("textbox", { name: "Annotation tags", exact: true })
    .fill("attention, research");
  await page
    .getByRole("textbox", { name: "Filter annotations", exact: true })
    .fill("research");
  await expect(page.locator(".annotation-card")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Filter annotations", exact: true })
    .fill("not-found");
  await expect(page.locator(".annotation-card")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Filter annotations", exact: true })
    .fill("");
  await page
    .getByRole("button", { name: "Sticky note tool", exact: true })
    .click();
  const bounds = (await page.locator('[data-page="2"] canvas').boundingBox())!;
  await page.mouse.click(bounds.x + 80, bounds.y + 140);
  await expect(page.locator(".annotation-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Undo annotation", exact: true })
    .click();
  await expect(page.locator(".annotation-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Redo annotation", exact: true })
    .click();
  await expect(page.locator(".annotation-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Pen tool", exact: true }).click();
  await page.mouse.move(bounds.x + 80, bounds.y + 220);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 170, bounds.y + 270, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".pen-overlay polyline")).toHaveCount(1);
  await expect(page.locator(".annotation-card")).toHaveCount(3);
  const pdfDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export annotated PDF", exact: true })
    .click();
  const exported = await pdfDownload;
  expect(exported.suggestedFilename()).toMatch(/annotated.pdf$/);
  const pdf = await PDFDocument.load(await readFile((await exported.path())!));
  expect(pdf.getPageCount()).toBe(6);
  await page
    .getByRole("button", { name: "Horizontal view", exact: true })
    .click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reset zoom", exact: true }),
  ).toHaveText("110%");
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const request = indexedDB.open("nemodoc");
        const db = await new Promise<IDBDatabase>(
          (resolve) => (request.onsuccess = () => resolve(request.result)),
        );
        const tx = db.transaction("sources");
        const get = tx.objectStore("sources").get("sample-paper");
        const value = await new Promise<any>(
          (resolve) => (get.onsuccess = () => resolve(get.result)),
        );
        db.close();
        return value?.readingState?.zoom;
      }),
    )
    .toBe(110);
  await page.reload();
  await expect(page.locator(".page-scroller")).toHaveClass(/horizontal/);
  await expect(
    page.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: "Reset zoom", exact: true }),
  ).toHaveText("110%");
  const backupDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up notebook", exact: true })
    .click();
  const backup = await backupDownload;
  const bytes = await readFile((await backup.path())!);
  const zip = await JSZip.loadAsync(bytes);
  const manifest = JSON.parse(await zip.file("notebook.json")!.async("string"));
  expect(manifest.annotations).toHaveLength(3);
  expect(manifest.sources[0].bookmarks).toContain(2);
  expect(manifest.sources[0].readingState.zoom).toBe(110);
  await page
    .getByLabel("Restore notebook backup", { exact: true })
    .setInputFiles({
      name: "backup.zip",
      mimeType: "application/zip",
      buffer: bytes,
    });
  await expect(
    page.getByRole("status").filter({ hasText: "notebook restored" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^All notebooks/ }).click();
  await expect(
    page
      .locator(".notebook-card")
      .filter({ hasText: "The thoughtful interface (restored)" }),
  ).toBeVisible();
  await page
    .locator(".notebook-card")
    .filter({ hasText: "The thoughtful interface (restored)" })
    .click();
  await page.getByRole("button", { name: /^Notes/ }).click();
  await expect(page.locator(".annotation-card")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Reset zoom", exact: true }),
  ).toHaveText("110%");
});

test("connection settings, semantic search and citations reveal supporting source text", async ({
  page,
}) => {
  const settings = {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    model: "nvidia/nemotron-3-nano-30b-a3b",
    embeddingBaseUrl: "https://integrate.api.nvidia.com/v1",
    embeddingModel: "nvidia/llama-nemotron-embed-1b-v2",
    visionBaseUrl: "https://integrate.api.nvidia.com/v1",
    visionModel: "nvidia/nemotron-nano-12b-v2-vl",
    rerankUrl: "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking",
    rerankModel: "nvidia/rerank-qa-mistral-4b",
    semantic: false,
    rerank: false,
    hasApiKey: false,
  };
  let saved: any;
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      Object.assign(settings, saved, { hasApiKey: !!saved.apiKey });
      delete (settings as any).apiKey;
    }
    await route.fulfill({ json: settings });
  });
  await page.route("**/api/settings/test", (route) =>
    route.fulfill({ json: { ok: true, latencyMs: 24 } }),
  );
  await page.route("**/api/search", (route) =>
    route.fulfill({
      json: {
        mode: "semantic",
        citations: [
          {
            id: 1,
            sourceId: "sample-paper",
            sourceName: "Designing for human attention.pdf",
            page: 2,
            text: "Every interface asks for a little of our attention.",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Local inference", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Chat API base URL", exact: true }),
  ).toHaveValue("http://127.0.0.1:8000/v1");
  await page
    .getByRole("button", { name: "NVIDIA hosted", exact: true })
    .click();
  await page.getByLabel("API key", { exact: true }).fill("test-browser-key");
  await page
    .getByLabel("Use semantic retrieval for chat and study tools")
    .check();
  await page.getByRole("button", { name: "Save & test", exact: true }).click();
  await expect(page.getByText("Connected successfully · 24 ms")).toBeVisible();
  expect(saved.semantic).toBe(true);
  expect(saved.apiKey).toBe("test-browser-key");
  await page.screenshot({ path: "test-results/settings.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/settings-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Search ideas", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search notebook ideas", exact: true })
    .fill("How do I protect focus?");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator(".semantic-results>button").click();
  await expect(
    page.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("2");
  await expect(page.locator(".evidence-highlight").first()).toBeVisible();
  await page.screenshot({ path: "test-results/evidence.png" });
});

test("OCR persists searchable selectable text and visual questions send a real page image", async ({
  page,
}) => {
  let visionBody: any;
  await page.route("**/api/ocr", (route) =>
    route.fulfill({
      json: {
        text: "Scanned diagram: a finite attention budget.",
        regions: [
          {
            text: "Scanned diagram: a finite attention budget.",
            x: 0.1,
            y: 0.2,
            width: 0.8,
            height: 0.05,
          },
        ],
      },
    }),
  );
  await page.route("**/api/vision", (route) => {
    visionBody = route.request().postDataJSON();
    return route.fulfill({
      json: { content: "The diagram shows an attention budget." },
    });
  });
  await page.goto("/");
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  await page.getByLabel("Upload sources", { exact: true }).setInputFiles({
    name: "Scan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator(".reader-file")).toContainText("Scan");
  await expect(
    page.getByRole("button", { name: "Recognize page text", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Recognize page text", exact: true })
    .click();
  await expect(page.locator(".ocr-text span")).toHaveText(
    "Scanned diagram: a finite attention budget.",
  );
  const text = page.locator(".ocr-text span");
  await text.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  await page.locator(".page-scroller").dispatchEvent("mouseup");
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(page.locator(".highlight")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".ocr-text span")).toHaveText(
    "Scanned diagram: a finite attention budget.",
  );
  await page
    .getByRole("button", { name: "Find in document", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search document text", exact: true })
    .fill("attention budget");
  await expect(page.locator(".search-results button")).toHaveCount(1);
  await page.getByRole("button", { name: "Close search", exact: true }).click();
  await page
    .getByRole("button", { name: "Ask about page image", exact: true })
    .click();
  await expect(page.locator(".visual-context img")).toBeVisible();
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(page.locator(".message.assistant")).toContainText(
    "The diagram shows an attention budget.",
  );
  expect(visionBody.image).toMatch(/^data:image\/jpeg;base64,/);
  expect(visionBody.image.length).toBeGreaterThan(1000);
  await expect(page.locator(".citation-list button")).toContainText("p. 1");
});

test("study studio generates, edits, quizzes, maps, persists and backs up all materials", async ({
  page,
}) => {
  let remembered: any;
  await page.route("**/api/agent/memory", (route) => {
    remembered = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });
  const citation = {
    id: 1,
    sourceId: "sample-paper",
    sourceName: "Designing for human attention.pdf",
    page: 2,
    text: "Every interface asks for a little of our attention.",
  };
  await page.route("**/api/study", (route) => {
    const { kind } = route.request().postDataJSON();
    return route.fulfill({
      json: {
        kind,
        title: `Attention ${kind}`,
        content:
          kind === "guide"
            ? "## Attention\nEvery interface asks for attention [1]."
            : "",
        items:
          kind === "flashcards" || kind === "quiz"
            ? Array.from({ length: 3 }, (_, i) => ({
                question: `What matters ${i + 1}?`,
                answer: "Human attention.",
                citationIds: [1],
                ...(kind === "quiz"
                  ? {
                      choices: ["Attention", "Noise", "Clutter", "Delay"],
                      correct: 0,
                    }
                  : {}),
              }))
            : [],
        nodes:
          kind === "mindmap"
            ? [
                { id: "root", label: "Attention", citationIds: [1] },
                {
                  id: "one",
                  parentId: "root",
                  label: "Focus",
                  citationIds: [1],
                },
                {
                  id: "two",
                  parentId: "root",
                  label: "Clarity",
                  citationIds: [1],
                },
              ]
            : undefined,
        citations: [citation],
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Flashcards", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Flashcard question", exact: true }),
  ).toContainText("What matters 1?");
  await page
    .getByRole("button", { name: "Flashcard question", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Flashcard answer", exact: true }),
  ).toContainText("Human attention.");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Flashcard answer text", exact: true })
    .fill("Finite attention.");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Flashcard answer", exact: true }),
  ).toContainText("Finite attention.");
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  for (const fieldset of await page.locator(".study-quiz fieldset").all())
    await fieldset.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: "Check answers", exact: true })
    .click();
  await expect(page.locator(".quiz-score")).toHaveText("3 / 3 correct");
  await page
    .getByRole("button", { name: "Remember quiz result", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Progress remembered", exact: true }),
  ).toBeDisabled();
  expect(remembered.kind).toBe("progress");
  expect(remembered.text).toContain("3/3 correct");
  await page.getByRole("button", { name: "Study guide", exact: true }).click();
  await expect(page.locator(".study-guide")).toContainText("Every interface");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Study guide content", exact: true })
    .fill("## Revised guide\nKeep your attention finite [1].");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await expect(page.locator(".study-guide")).toContainText("Revised guide");
  await page.getByRole("button", { name: "Mind map", exact: true }).click();
  await expect(page.locator(".map-node")).toHaveCount(3);
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(page.locator(".map-detail")).toContainText("Focus");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Mind map node label", exact: true })
    .fill("Deep focus");
  await page
    .getByRole("button", { name: "Collapse Attention", exact: true })
    .click();
  await expect(page.locator(".map-node")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Expand Attention", exact: true })
    .click();
  await expect(page.locator(".map-node")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await page.screenshot({ path: "test-results/studio.png" });
  await page.reload();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(
    page
      .getByRole("combobox", { name: "Saved study material", exact: true })
      .locator("option"),
  ).toHaveCount(5);
  await page
    .getByRole("combobox", { name: "Saved study material", exact: true })
    .selectOption({ label: "Attention flashcards · flashcards" });
  await page
    .getByRole("button", { name: "Flashcard question", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Flashcard answer", exact: true }),
  ).toContainText("Finite attention.");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up notebook", exact: true })
    .click();
  const zip = await JSZip.loadAsync(
    await readFile((await (await download).path())!),
  );
  const manifest = JSON.parse(await zip.file("notebook.json")!.async("string"));
  expect(manifest.artifacts).toHaveLength(4);
  expect(
    manifest.artifacts.find((a: any) => a.kind === "mindmap").nodes[1].label,
  ).toBe("Deep focus");
});

test("side by side comparison reads independently and grounds AI in exactly the pair", async ({
  page,
}) => {
  let body: any;
  await page.route("**/api/chat", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({
      contentType: "text/event-stream",
      body: 'event: delta\ndata: "These sources complement each other."\n\nevent: done\ndata: {}\n\n',
    });
  });
  await page.goto("/");
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("A second perspective on attention.", {
    x: 40,
    y: 700,
    font,
    size: 22,
  });
  await page.getByLabel("Upload sources", { exact: true }).setInputFiles({
    name: "Perspective.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator(".reader-file")).toContainText("Perspective");
  await page
    .getByRole("button", { name: "Compare sources", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Document reader" }),
  ).toHaveCount(2);
  await expect(page.locator(".reader")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Right comparison source", exact: true })
    .selectOption("sample-paper");
  await page
    .locator(".reader")
    .nth(1)
    .getByRole("button", { name: "Next page", exact: true })
    .click();
  await expect(
    page
      .locator(".reader")
      .nth(1)
      .getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("2");
  await expect(
    page
      .locator(".reader")
      .first()
      .getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("1");
  await expect(
    page.locator(".reader").nth(1).locator('[data-page="2"] canvas'),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/comparison.png" });
  await page
    .getByRole("button", { name: "Compare ideas", exact: true })
    .click();
  await expect(page.locator(".message.assistant")).toContainText(
    "These sources complement",
  );
  expect(body.sources).toHaveLength(2);
  expect(body.sources.map((s: any) => s.name)).toContain("Perspective.pdf");
  await page
    .getByRole("button", { name: "Close comparison", exact: true })
    .click();
  await expect(page.locator(".reader")).toHaveCount(1);
});

test("PDF outlines and exact reading position survive a reload across mixed page sizes", async ({
  page,
}) => {
  await page.goto("/");
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf
    .addPage([792, 300])
    .drawText("Landscape introduction", { x: 30, y: 230, font, size: 22 });
  const second = pdf.addPage([612, 1100]);
  second.drawText("Chapter two: a long reading page", {
    x: 30,
    y: 1000,
    font,
    size: 22,
  });
  pdf
    .addPage([612, 792])
    .drawText("Closing page", { x: 30, y: 700, font, size: 22 });
  const outline = pdf.context.obj({ Type: "Outlines", Count: 1 }),
    outlineRef = pdf.context.register(outline),
    item = pdf.context.obj({
      Title: PDFString.of("Chapter two"),
      Parent: outlineRef,
      Dest: [second.ref, PDFName.of("Fit")],
    }),
    itemRef = pdf.context.register(item);
  outline.set(PDFName.of("First"), itemRef);
  outline.set(PDFName.of("Last"), itemRef);
  pdf.catalog.set(PDFName.of("Outlines"), outlineRef);
  await page.getByLabel("Upload sources", { exact: true }).setInputFiles({
    name: "Navigation.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator(".reader-file")).toContainText("Navigation");
  await expect(
    page.getByRole("button", { name: "Recognize page text", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Toggle page navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Document outline", exact: true })
    .click();
  await page.getByRole("button", { name: /Chapter two/ }).click();
  await expect(page.locator('[data-page="2"] canvas')).toBeVisible();
  await page
    .getByRole("button", { name: "Toggle page navigation", exact: true })
    .click();
  await page.locator(".page-scroller").evaluate((root) => {
    const el = root.querySelector<HTMLElement>('[data-page="2"]')!;
    root.scrollTop +=
      el.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      el.clientHeight * 0.3 -
      30;
  });
  const savedFraction = async () =>
    page.evaluate(async () => {
      const request = indexedDB.open("nemodoc");
      const db = await new Promise<IDBDatabase>(
        (resolve) => (request.onsuccess = () => resolve(request.result)),
      );
      const get = db.transaction("sources").objectStore("sources").getAll();
      const all = await new Promise<any[]>(
        (resolve) => (get.onsuccess = () => resolve(get.result)),
      );
      db.close();
      return all.find((s) => s.name === "Navigation.pdf")?.readingState
        ?.fraction;
    });
  await expect.poll(savedFraction).toBeGreaterThan(0.29);
  await expect.poll(savedFraction).toBeLessThan(0.31);
  const before = await page
    .locator('[data-page="2"]')
    .evaluate((el) => el.getBoundingClientRect().top);
  await page.reload();
  await expect(page.locator('[data-page="2"] canvas')).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("2");
  await expect
    .poll(() =>
      page
        .locator('[data-page="2"]')
        .evaluate((el) => el.getBoundingClientRect().top),
    )
    .toBeGreaterThan(before - 2);
  await expect
    .poll(() =>
      page
        .locator('[data-page="2"]')
        .evaluate((el) => el.getBoundingClientRect().top),
    )
    .toBeLessThan(before + 2);
});
test("existing MVP libraries migrate without losing original documents, notes, or highlights", async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = Array.from(await pdf.save());
  await page.route("**/legacy-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Migration fixture</title>",
    }),
  );
  await page.goto("/legacy-fixture");
  await page.evaluate(async (bytes) => {
    const request = indexedDB.open("nemodoc", 1);
    request.onupgradeneeded = () => {
      for (const name of ["notebooks", "sources", "annotations"])
        request.result.createObjectStore(name, { keyPath: "id" });
    };
    const db = await new Promise<IDBDatabase>(
      (resolve) => (request.onsuccess = () => resolve(request.result)),
    );
    const tx = db.transaction(
      ["notebooks", "sources", "annotations"],
      "readwrite",
    );
    tx.objectStore("notebooks").put({
      id: "legacy-notebook",
      title: "My previous notebook",
      description: "Existing MVP library",
      createdAt: 1,
      notes: "Keep my original notebook notes.",
      messages: [],
    });
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    tx.objectStore("sources").put({
      id: "legacy-source",
      notebookId: "legacy-notebook",
      name: "Legacy.pdf",
      kind: "pdf",
      blob,
      pages: [""],
      size: blob.size,
      createdAt: 1,
    });
    tx.objectStore("annotations").put({
      id: "legacy-note",
      sourceId: "legacy-source",
      page: 1,
      quote: "A previous highlight",
      note: "Keep this annotation.",
      color: "yellow",
      rects: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.03 }],
      createdAt: 1,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, bytes);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "My previous notebook", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator(".highlight")).toHaveCount(1);
  await page.getByRole("button", { name: /^Notes/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Notebook notes", exact: true }),
  ).toHaveValue("Keep my original notebook notes.");
  await expect(
    page.getByRole("textbox", { name: "Annotation note", exact: true }),
  ).toHaveValue("Keep this annotation.");
  expect(
    await page.evaluate(async () => {
      const request = indexedDB.open("nemodoc");
      const db = await new Promise<IDBDatabase>(
        (resolve) => (request.onsuccess = () => resolve(request.result)),
      );
      const result = {
        version: db.version,
        hasArtifacts: db.objectStoreNames.contains("artifacts"),
      };
      db.close();
      return result;
    }),
  ).toEqual({ version: 2, hasArtifacts: true });
});
