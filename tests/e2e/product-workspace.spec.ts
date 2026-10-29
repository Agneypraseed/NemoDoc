import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
const sourceName = "Designing for human attention.pdf";
async function menuDownload(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Notebook actions", exact: true })
    .click();
  await page.getByRole("button", { name, exact: true }).click();
  return pending;
}
async function studyFixtures(page: Page, requests: any[]) {
  await page.route("**/api/study", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const citations = [
      {
        id: 1,
        sourceId: "sample-paper",
        sourceName,
        page: 3,
        text: "Continuous reading",
      },
      {
        id: 2,
        sourceId: "sample-paper",
        sourceName: "Uncited retrieval candidate",
        page: 5,
        text: "Not used",
      },
    ];
    const kind = body.kind;
    return route.fulfill({
      json: {
        kind,
        title: `Fixture ${kind}`,
        content:
          kind === "guide"
            ? "| Topic | Explanation |\n| --- | --- |\n| Focus | Continuous reading [1] |\n\n[Unavailable](#citation-999)"
            : "",
        items:
          kind === "quiz" || kind === "flashcards"
            ? Array.from({ length: 3 }, (_, i) => ({
                question: `Question ${i + 1}`,
                answer: `Answer ${i + 1}`,
                citationIds: [1],
                ...(kind === "quiz"
                  ? {
                      choices: [`Right ${i + 1}`, `Wrong ${i + 1}`],
                      correct: 0,
                    }
                  : {}),
              }))
            : [],
        nodes:
          kind === "mindmap"
            ? [
                { id: "root", label: "Main idea", citationIds: [1] },
                {
                  id: "child",
                  parentId: "root",
                  label: "Supporting idea",
                  citationIds: [1],
                },
                {
                  id: "child2",
                  parentId: "root",
                  label: "Another connection",
                  citationIds: [1],
                },
              ]
            : undefined,
        citations,
      },
    });
  });
}
test("sources and all study formats remain connected and editable across a full backup restore", async ({
  page,
}) => {
  const requests: any[] = [];
  await studyFixtures(page, requests);
  await page.goto("/app");
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Other synthetic study material.");
  await page.getByLabel("Upload sources", { exact: true }).setInputFiles({
    name: "Other reading.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(
    page.getByLabel("Use Other reading.pdf in chat", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Use Other reading.pdf in chat", { exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Study guide", exact: true }).click();
  const material = page.getByRole("region", {
    name: "Study material",
    exact: true,
  });
  await expect(material.getByRole("table")).toContainText("Continuous reading");
  await expect(material).toContainText("Unavailable (source unavailable)");
  const guideDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export study material", exact: true })
    .click();
  const guide = await readFile((await (await guideDownload).path())!, "utf8");
  expect(guide).toContain(sourceName);
  expect(guide).not.toContain("Uncited retrieval candidate");
  await page.getByRole("button", { name: "Flashcards", exact: true }).click();
  await page
    .getByRole("button", { name: "Flashcard question", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Flashcard answer", exact: true }),
  ).toContainText("Answer 1");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Flashcard question text", exact: true })
    .fill("Edited card question");
  await page
    .getByRole("textbox", { name: "Flashcard answer text", exact: true })
    .fill("Edited card answer");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await page.getByRole("button", { name: "Mind map", exact: true }).click();
  await material
    .getByRole("button", { name: "Main idea", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Mind map node label", exact: true })
    .fill("Edited root idea");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await expect(
    material.getByRole("button", { name: "Edited root idea", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Quiz question 1", exact: true })
    .fill("Edited quiz question");
  await page
    .getByRole("textbox", { name: "Quiz explanation 1", exact: true })
    .fill("Edited quiz explanation");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();

  const questions = page.locator(".study-quiz fieldset");
  for (let i = 0; i < 3; i++)
    await questions
      .nth(i)
      .getByRole("radio")
      .nth(i === 1 ? 1 : 0)
      .check();
  await page
    .getByRole("button", { name: "Check answers", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Your learning", exact: true }),
  ).toContainText("Last score: 2/3");
  expect(requests).toHaveLength(4);
  expect(
    requests.every(
      (r) => r.sources.length === 1 && r.sources[0].id === "sample-paper",
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Notebook notes", exact: true })
    .fill("My study plan with a table and source notes.");
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  const graph = page.getByRole("region", {
    name: "Notebook connections",
    exact: true,
  });
  await graph.getByRole("button", { name: "Table", exact: true }).click();
  await expect(graph.getByRole("table")).toContainText("Fixture flashcards");
  await expect(graph.getByRole("table")).toContainText("Other reading.pdf");
  const download = await menuDownload(page, "Back up notebook");
  const bytes = await readFile((await download.path())!);
  const zip = await JSZip.loadAsync(bytes);
  const manifest = JSON.parse(await zip.file("notebook.json")!.async("string"));
  expect(manifest.sources).toHaveLength(2);
  expect(manifest.artifacts).toHaveLength(4);
  expect(manifest.notebooks[0].quizAttempts).toHaveLength(1);
  await page
    .getByLabel("Restore notebook backup", { exact: true })
    .setInputFiles({
      name: "study-backup.zip",
      mimeType: "application/zip",
      buffer: bytes,
    });
  await expect(
    page.getByRole("status").filter({ hasText: "1 notebook restored" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^All notebooks/ }).click();
  await page
    .locator(".library-row")
    .filter({ hasText: "Sample notebook (restored)" })
    .click();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Your learning", exact: true }),
  ).toContainText("Last score: 2/3");
  const selector = page.getByRole("combobox", {
    name: "Saved study material",
    exact: true,
  });
  await selector.selectOption({ label: "Fixture flashcards · flashcards" });
  await expect(
    page.getByRole("button", { name: "Flashcard question", exact: true }),
  ).toContainText("Edited card question");
  await page
    .getByRole("button", { name: "Flashcard question", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Flashcard answer", exact: true }),
  ).toContainText("Edited card answer");
  await selector.selectOption({ label: "Fixture quiz · quiz" });
  await expect(material).toContainText("Edited quiz question");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Quiz explanation 1", exact: true }),
  ).toHaveValue("Edited quiz explanation");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await selector.selectOption({ label: "Fixture mindmap · mindmap" });
  await expect(
    material.getByRole("button", { name: "Edited root idea", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await graph
    .getByRole("button", { name: "study: Fixture guide", exact: true })
    .click();
  await graph
    .getByRole("button", { name: "Open in Studio", exact: true })
    .click();
  await expect(material.getByRole("table")).toContainText("Continuous reading");
  await material.locator(".inline-citation").click();
  await expect(page.locator('[data-page="3"] canvas')).toBeVisible();
  await page.screenshot({ path: "output/product-formats-final.png" });
  await page.reload();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Notebook notes", exact: true }),
  ).toHaveValue("My study plan with a table and source notes.");
});

test("source removal preserves authored notes with undo and exports missing references honestly", async ({
  page,
}) => {
  let revocations = 0;
  await page.route("**/api/agent/sources/revoke", (route) => {
    revocations++;
    return route.fulfill({ json: { ok: true } });
  });
  await studyFixtures(page, []);
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: 'event: sources\ndata: [{"id":1,"sourceId":"sample-paper","sourceName":"Designing for human attention.pdf","page":2,"text":"Every interface asks for attention."}]\n\nevent: delta\ndata: "A focused interface protects attention. [1]"\n\nevent: done\ndata: {}\n\n',
    }),
  );
  await page.goto("/app");
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Study guide", exact: true }).click();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
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
  const select = async () => {
    await text.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.locator(".page-scroller").dispatchEvent("mouseup");
  };
  await select();
  await page
    .getByRole("toolbar", { name: "Selected text actions" })
    .getByRole("button", { name: "Highlight", exact: true })
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: /^Highlights/ }).click();
  await page
    .getByRole("textbox", { name: "Annotation note", exact: true })
    .fill("My authored highlight comment 学習");
  await page
    .getByRole("textbox", { name: "Annotation tags", exact: true })
    .fill("exam, attention");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await select();
  const actions = page.getByRole("toolbar", { name: "Selected text actions" });
  await actions.getByRole("button", { name: "Ask AI", exact: true }).click();
  await actions
    .getByRole("textbox", { name: "Ask about selected passage" })
    .fill("Explain this selected passage");
  await actions
    .getByRole("textbox", { name: "Ask about selected passage" })
    .press("Enter");
  const answer = page.locator(".message.assistant");
  await answer
    .getByRole("button", { name: "Edit answer", exact: true })
    .click();
  await answer
    .getByRole("textbox", { name: "Answer text", exact: true })
    .fill("My edited passage explanation. [1]");
  await answer
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Remove ${sourceName}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Remove ${sourceName}`, exact: true }),
  ).toHaveCount(0);
  await expect(answer).toContainText("My edited passage explanation");
  await expect(answer.locator(".inline-citation")).toHaveCount(0);
  await expect(answer.getByRole("status")).toContainText("unavailable");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  const notebookText = page.getByRole("textbox", {
    name: "Notebook notes",
    exact: true,
  });
  await expect(notebookText).toHaveValue(/My authored highlight comment/);
  await expect(notebookText).toHaveValue(/My edited passage explanation/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Remove ${sourceName}`, exact: true }),
  ).toBeVisible();
  await expect(notebookText).not.toHaveValue(/Preserved notes from/);
  await page.getByRole("button", { name: /^Highlights/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Annotation note", exact: true }),
  ).toHaveValue("My authored highlight comment 学習");
  await page
    .getByRole("button", { name: `Remove ${sourceName}`, exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await expect(notebookText).toHaveValue(/My edited passage explanation/);
  await expect(notebookText).toHaveValue(/exam, attention/);
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Saved study material", exact: true })
    .selectOption({ label: "Fixture guide · guide" });
  const material = page.getByRole("region", {
    name: "Study material",
    exact: true,
  });
  await expect(material).toContainText("source pages are unavailable");
  await expect(material.locator(".inline-citation")).toHaveCount(0);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export study material", exact: true })
    .click();
  const exported = await readFile((await (await pending).path())!, "utf8");
  expect(exported).toContain("Unavailable references");
  expect(exported).not.toContain("## Cited sources");
  expect(exported).not.toContain("Uncited retrieval candidate");
  const backup = await menuDownload(page, "Back up notebook");
  const bytes = await readFile((await backup.path())!);
  const zip = await JSZip.loadAsync(bytes);
  const manifest = JSON.parse(await zip.file("notebook.json")!.async("string"));
  expect(manifest.sources).toHaveLength(0);
  expect(manifest.annotations).toHaveLength(0);
  expect(manifest.notebooks[0].passageNotes).toHaveLength(0);
  expect(manifest.notebooks[0].notes).toContain(
    "My authored highlight comment",
  );
  await page
    .getByLabel("Restore notebook backup", { exact: true })
    .setInputFiles({
      name: "removed-source-backup.zip",
      mimeType: "application/zip",
      buffer: bytes,
    });
  await expect(
    page.getByRole("status").filter({ hasText: "1 notebook restored" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^All notebooks/ }).click();
  await page
    .locator(".library-row")
    .filter({ hasText: "Sample notebook (restored)" })
    .click();
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  const graph = page.getByRole("region", {
    name: "Notebook connections",
    exact: true,
  });
  await expect(graph.getByRole("button", { name: /^source:/ })).toHaveCount(0);
  await graph
    .getByRole("button", { name: "note: Notebook notes", exact: true })
    .click();
  await expect(
    graph.getByRole("region", { name: "Selected connection" }),
  ).toContainText("My edited passage explanation");
  await graph
    .getByRole("region", { name: "Selected connection" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "output/product-source-final.png" });
  expect(revocations).toBe(2);
});
