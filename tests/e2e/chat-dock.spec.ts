import { test, expect } from "@playwright/test";

test("chat can close without losing a draft; bottom input sends and suggestions appear only on demand", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/chat", (route) => {
    calls++;
    return route.fulfill({
      contentType: "text/event-stream",
      body: 'event: sources\ndata: [{"id":1,"sourceId":"sample-paper","sourceName":"Designing for human attention.pdf","page":3,"text":"Vertical scrolling supports continuous reading."}]\n\nevent: delta\ndata: "Vertical scrolling supports continuous reading. [1]"\n\nevent: done\ndata: {}\n\n',
    });
  });
  await page.goto("/");
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({
    timeout: 15_000,
  });
  const assistant = page.getByRole("complementary", {
    name: "Notebook assistant",
  });
  const input = page.getByRole("textbox", { name: "Ask about your sources" });
  await expect(
    page.getByRole("region", { name: "Suggested questions" }),
  ).toHaveCount(0);
  await input.fill("Keep this thought");
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await expect(assistant).toBeHidden();
  await expect(input).toHaveValue("Keep this thought");
  await expect(
    page.getByRole("button", { name: "Open chat", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Suggestions", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Suggested questions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Find the big picture/ }).click();
  await expect(input).toHaveValue("Summarize the key ideas in my sources.");
  expect(calls).toBe(0);
  await expect(assistant).toBeHidden();
  await expect(input).toBeFocused();
  await input.press("Enter");
  await expect(assistant).toBeVisible();
  await expect(page.locator(".message.assistant")).toContainText(
    "Vertical scrolling",
  );
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Save to Notes" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  const notes = page.getByRole("textbox", { name: "Notebook notes" });
  await expect(notes).toContainText("Summarize the key ideas in my sources.");
  await expect(notes).toContainText(
    "Vertical scrolling supports continuous reading",
  );
  await expect(notes).toContainText(
    "Designing for human attention.pdf — page 3",
  );
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await page.getByRole("button", { name: "Open chat", exact: true }).click();
  await expect(page.locator(".message.assistant")).toContainText(
    "Vertical scrolling",
  );
  await page.locator(".inline-citation").click();
  await expect(
    page.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("3");
  await expect(page.locator('[data-page="3"] canvas')).toBeVisible();
  await page.getByRole("button", { name: "Suggestions", exact: true }).click();
  await page.screenshot({
    path: "test-results/chat-dock-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "Suggested questions" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Suggestions", exact: true }).click();
  await page.getByRole("heading", { name: "The thoughtful interface" }).click();
  await expect(
    page.getByRole("region", { name: "Suggested questions" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await input.fill("Ask while reviewing notes");
  await expect(input).toBeVisible();
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".message.assistant")).toContainText(
    "Vertical scrolling",
  );
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
});

test("mobile bottom chat and on-demand cards fit the viewport and the panel stays above the input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  const input = page.getByRole("textbox", { name: "Ask about your sources" });
  await expect(input).toBeVisible();
  await page.getByRole("button", { name: "Open chat", exact: true }).click();
  const assistant = page.getByRole("complementary", {
    name: "Notebook assistant",
  });
  await expect(assistant).toBeVisible();
  const box = await assistant.boundingBox();
  const close = await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .boundingBox();
  expect(close!.x + close!.width).toBeLessThanOrEqual(box!.x + box!.width);
  const dock = await page.locator(".workspace-chat").boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(dock!.y);
  await page
    .getByRole("button", { name: "Close assistant", exact: true })
    .click();
  await input.fill("A thought to come back to");
  await page.getByRole("button", { name: "Suggestions", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Suggested questions" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/chat-dock-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close suggestions", exact: true })
    .click();
  await expect(input).toHaveValue("A thought to come back to");
  await expect(assistant).toBeHidden();
});
