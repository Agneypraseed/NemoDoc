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

test("paper workspace gives space to the document and passage questions return cited margin answers", async ({
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
  await expect
    .poll(async () => {
      const line = await page
        .locator('[data-page="2"] .textLayer span')
        .filter({ hasText: "Every interface" })
        .first()
        .boundingBox();
      const card = await assistant.boundingBox();
      return Math.abs(card!.y - line!.y);
    })
    .toBeLessThan(48);
  expect(requests).toHaveLength(1);
  expect(requests[0].answerMode).toBe("deep");
  expect(requests[0].question).toContain("Why does this matter?");
  expect(requests[0].selection.page).toBe(2);
  expect(requests[0].selection.quote).toContain("Every interface");
  expect(requests[0].selection.sourceId).toBe("sample-paper");
  expect(requests[0].sources.map((s: any) => s.id)).toEqual(["sample-paper"]);
  await expect(page.locator(".message.user p")).toHaveText(
    "Why does this matter?",
  );
  await page.locator(".inline-citation").click();
  await expect(
    page.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("2");
  await page
    .getByRole("button", { name: "Save to Notes", exact: true })
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Notebook notes", exact: true }),
  ).toContainText("Why does this matter?");
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
    page.getByRole("button", { name: "Save to Notes", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await page.reload();
  await expect(assistant).toBeHidden();
  await page.getByRole("button", { name: "Open chat", exact: true }).click();
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toBeDisabled();
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

test("paper and dark reading views stay compact on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
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
  await page.setViewportSize({ width: 390, height: 844 });
  const selection = await selectPassage(page);
  await selection.getByRole("button", { name: "Ask AI", exact: true }).click();
  await selection
    .getByRole("textbox", { name: "Ask about selected passage" })
    .fill("What does attention mean here?");
  const box = await selection.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/passage-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
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
