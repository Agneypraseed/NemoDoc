import { test, expect, type Page } from "@playwright/test";
import { openReaderTools } from "./reader-tools";

async function selectPassage(page: Page) {
  const number = page.getByRole("textbox", {
    name: "Page number",
    exact: true,
  });
  await number.fill("2");
  await number.press("Enter");
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
  return page.getByRole("toolbar", { name: "Selected text actions" });
}

test("paper workspace gives space to the document and passage questions stay in chat", async ({
  page,
}) => {
  const requests: any[] = [];
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
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      contentType: "text/event-stream",
      body: 'event: sources\ndata: [{"id":1,"sourceId":"sample-paper","sourceName":"Designing for human attention.pdf","page":2,"text":"Every interface asks for a little of our attention."}]\n\nevent: delta\ndata: "Good design protects our limited attention. [1]"\n\nevent: done\ndata: {}\n\n',
    });
  });
  await page.goto("/");
  const assistant = page.getByRole("complementary", {
    name: "Notebook assistant",
  });
  await expect(assistant).toBeHidden();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(242, 238, 232)",
  );
  await expect(
    page.getByRole("toolbar", { name: "Annotation tools" }),
  ).toBeHidden();
  const dock = await page.locator(".workspace-chat").boundingBox();
  expect(dock!.height).toBeLessThan(60);
  const stage = await page.locator(".reader-stage").boundingBox();
  expect(stage!.height).toBeGreaterThan(780);
  await openReaderTools(page);
  await expect(
    page.getByRole("button", { name: "Book view", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Reader tools", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("toolbar", { name: "Annotation tools" }),
  ).toBeHidden();
  const selection = await selectPassage(page);
  await selection.getByRole("button", { name: "Ask AI", exact: true }).click();
  const passageInput = selection.getByRole("textbox", {
    name: "Ask about selected passage",
  });
  await expect(passageInput).toBeFocused();
  await selection.getByRole("button", { name: "Deep", exact: true }).click();
  await passageInput.fill("Why does this matter?");
  await selection.screenshot({
    path: "test-results/passage-popover.png",
  });
  await passageInput.press("Enter");
  await expect(assistant).toBeVisible();
  await expect(page.locator(".message.assistant")).toContainText(
    "Good design protects",
  );
  const firstCard = await assistant.boundingBox();
  expect(firstCard!.width).toBeGreaterThanOrEqual(560);
  expect(firstCard!.height).toBeGreaterThan(600);
  expect(firstCard!.y).toBeLessThan(100);
  expect(firstCard!.x + firstCard!.width).toBeLessThanOrEqual(1416);
  expect(requests).toHaveLength(1);
  expect(requests[0].answerMode).toBe("deep");
  expect(requests[0].question).toContain("Why does this matter?");
  expect(requests[0].selection.page).toBe(2);
  expect(requests[0].selection.quote).toContain("Every interface");
  expect(requests[0].selection.sourceId).toBe("sample-paper");
  expect(requests[0].sources.map((s: any) => s.id)).toEqual(["sample-paper"]);
  const passageMarker = page
    .locator('[data-page="2"] .passage-note-marker')
    .first();
  await expect(passageMarker).toHaveCSS("width", "7px");
  await expect(passageMarker).toHaveCSS("height", "7px");
  await expect(passageMarker).toHaveCSS("border-radius", "50%");
  await expect(passageMarker).toHaveCSS("border-bottom-width", "0px");
  await expect(page.locator(".message.user p")).toHaveText(
    "Why does this matter?",
  );
  const resize = page.getByRole("button", { name: "Resize answer card" });
  await resize.focus();
  await resize.press("Shift+ArrowRight");
  const resizedCard = await assistant.boundingBox();
  const carriedWidth = resizedCard!.width;
  expect(resizedCard!.x + resizedCard!.width).toBeLessThanOrEqual(1416);
  await page.locator(".inline-citation").click();
  const citedPassage = page.locator(
    '[data-page="2"] .evidence-highlight',
  ).first();
  await expect(citedPassage).toBeVisible();
  await expect(citedPassage).toHaveCSS("border-bottom-width", "0px");
  await expect(
    page.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("2");
  await page.getByRole("button", { name: "Add to Notes", exact: true }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.locator(".saved-answer-question")).toContainText(
    "Why does this matter?",
  );
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.screenshot({
    path: "test-results/reading-margin.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Quick", exact: true }).click();
  const nextSelection = await selectPassage(page);
  await nextSelection
    .getByRole("button", { name: "Define", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].answerMode).toBe("quick");
  expect(requests[1].question).toContain("Define the selected term");
  await expect(
    page.getByRole("button", { name: "Add to Notes", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".message.user p")).toHaveText([
    "Why does this matter?",
    "Define the selected term in the context of this passage.",
  ]);
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await expect(page.locator(".passage-message-actions")).toHaveCount(2);
  await expect(page.locator(".passage-note-inline-preview")).toHaveCount(0);
  await expect
    .poll(async () => (await assistant.boundingBox())!.width)
    .toBeGreaterThanOrEqual(carriedWidth - 1);
  const nextCard = await assistant.boundingBox();
  expect(nextCard!.x + nextCard!.width).toBeLessThanOrEqual(1416);
  await page.screenshot({ path: "test-results/passage-chat-history.png" });
  await resize.focus();
  await resize.press("Shift+ArrowLeft");
  await resize.press("Shift+ArrowDown");
  await page.screenshot({ path: "test-results/passage-note-resized.png" });
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await page.reload();
  await expect(assistant).toBeHidden();
  await page.getByRole("button", { name: "Open chat", exact: true }).click();
  await expect(page.locator(".chat-welcome")).toBeHidden();
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await expect(
    page.locator('[data-page="2"] .passage-note-marker'),
  ).toHaveCount(1);
  await page.locator('[data-page="2"] .passage-note-marker').first().click();
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await expect(page.locator(".message-passage-context")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Add to Notes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await openReaderTools(page);
  await page.getByRole("button", { name: "Focus reader", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  const focusedSelection = await selectPassage(page);
  await expect
    .poll(() =>
      focusedSelection.evaluate(
        (element) => !!document.fullscreenElement?.contains(element),
      ),
    )
    .toBe(true);
  await focusedSelection
    .getByRole("button", { name: "Ask AI", exact: true })
    .click();
  await expect(
    focusedSelection.getByRole("textbox", {
      name: "Ask about selected passage",
    }),
  ).toBeFocused();
  await page.evaluate(() => document.exitFullscreen());
});

test("an unverified passage error appears in the chat turn", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        local: false,
        model: "nvidia/Nemotron-3_5-Lightning",
      },
    }),
  );
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 422,
      json: {
        error:
          "That selection could not be matched to this page's text. Select it again, or use Recognize page text for a scanned page.",
      },
    }),
  );
  await page.goto("/");
  const selection = await selectPassage(page);
  await selection.getByRole("button", { name: "Ask AI", exact: true }).click();
  const question = selection.getByRole("textbox", {
    name: "Ask about selected passage",
  });
  await question.fill("What does this passage mean?");
  await question.press("Enter");

  const assistant = page.getByRole("complementary", {
    name: "Notebook assistant",
  });
  await expect(assistant).toBeVisible();
  const error = assistant.locator(".message.assistant .form-error");
  await expect(error).toContainText("could not be matched to this page's text");
  await expect(page.locator(".chat-error")).toHaveCount(0);
  await expect(page.locator(".message-passage-context")).toContainText(
    "Page 2",
  );
  await page.screenshot({
    path: "test-results/passage-selection-error-chat.png",
  });
});

test("selected passage opens a roomy answer card on medium screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 800 });
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        local: false,
        model: "nvidia/Nemotron-3_5-Lightning",
      },
    }),
  );
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: 'event: sources\ndata: [{"id":1,"sourceId":"sample-paper","sourceName":"Designing for human attention.pdf","page":2,"text":"Every interface asks for a little of our attention."}]\n\nevent: delta\ndata: "A comfortable answer needs room to read. [1]"\n\nevent: done\ndata: {}\n\n',
    }),
  );
  await page.goto("/");
  const selection = await selectPassage(page);
  await selection.getByRole("button", { name: "Ask AI", exact: true }).click();
  const question = selection.getByRole("textbox", {
    name: "Ask about selected passage",
  });
  await question.fill("Why does this matter?");
  await question.press("Enter");

  const assistant = page.getByRole("complementary", {
    name: "Notebook assistant",
  });
  await expect(assistant).toBeVisible();
  await expect(assistant.locator(".message.assistant")).toContainText(
    "A comfortable answer needs room to read.",
  );
  await expect(assistant).toHaveAttribute("data-context-answer", "true");
  const box = await assistant.boundingBox();
  const dock = await page.locator(".workspace-chat").boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(440);
  expect(box!.height).toBeGreaterThanOrEqual(420);
  expect(box!.x + box!.width).toBeLessThanOrEqual(960);
  expect(box!.y + box!.height).toBeLessThanOrEqual(dock!.y);
  await page.screenshot({ path: "test-results/passage-answer-medium.png" });
});

test("paper and dark reading views stay compact on desktop and mobile", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        local: false,
        model: "nvidia/Nemotron-3_5-Lightning",
      },
    }),
  );
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: 'event: sources\ndata: [{"id":1,"sourceId":"sample-paper","sourceName":"Designing for human attention.pdf","page":2,"text":"Every interface asks for a little of our attention."}]\n\nevent: delta\ndata: "A clear reading space gives each idea room to breathe. [1]"\n\nevent: done\ndata: {}\n\n',
    }),
  );
  await page.goto("/");
  const assistant = page.getByRole("complementary", {
    name: "Notebook assistant",
  });
  await expect(
    page.locator('[data-page="1"] .textLayer span').first(),
  ).toBeVisible();
  // Wait for the cover's original title to paint after its selectable layer.
  await expect
    .poll(() =>
      page
        .locator('[data-page="1"] canvas')
        .evaluate((canvas: HTMLCanvasElement) => {
          const data = canvas
            .getContext("2d")!
            .getImageData(
              0,
              0,
              canvas.width,
              Math.floor(canvas.height * 0.4),
            ).data;
          let ink = 0;
          for (let i = 0; i < data.length; i += 4)
            if (
              data[i] < 100 &&
              data[i + 1] < 100 &&
              data[i + 2] < 100 &&
              data[i + 3] > 0
            )
              ink++;
          return ink;
        }),
    )
    .toBeGreaterThan(1000);
  await page.screenshot({
    path: "test-results/reading-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".document-page").first()).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.screenshot({
    path: "test-results/reading-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.setViewportSize({ width: 440, height: 786 });
  const selection = await selectPassage(page);
  await selection.getByRole("button", { name: "Ask AI", exact: true }).click();
  const passageQuestion = selection.getByRole("textbox", {
    name: "Ask about selected passage",
  });
  await passageQuestion.fill("What does attention mean here?");
  const box = await selection.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(440);
  await page.screenshot({
    path: "test-results/passage-mobile.png",
    fullPage: true,
  });
  await passageQuestion.press("Enter");
  await expect(assistant).toBeVisible();
  await expect(page.locator(".message.assistant").last()).toContainText(
    "A clear reading space gives each idea room to breathe",
  );
  const noteBox = await assistant.boundingBox();
  expect(noteBox!.x).toBeGreaterThanOrEqual(0);
  expect(noteBox!.x + noteBox!.width).toBeLessThanOrEqual(440);
  expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(786);
  await page.screenshot({
    path: "test-results/passage-note-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const dock = await page.locator(".workspace-chat").boundingBox();
  expect(dock!.height).toBeLessThan(60);
  const stage = await page.locator(".reader-stage").boundingBox();
  expect(stage!.height).toBeGreaterThan(600);
  await page.screenshot({
    path: "test-results/reading-mobile.png",
    fullPage: true,
  });
});
