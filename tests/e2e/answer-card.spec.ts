import { test, expect } from "./fixtures";

for (const mobile of [false, true]) {
  test(`answer card can move, stays in bounds, and returns to its margin on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: 'event: sources\ndata: [{"id":1,"sourceId":"sample-paper","sourceName":"Designing for human attention.pdf","page":2,"text":"Every interface asks for a little of our attention."}]\n\nevent: delta\ndata: "A focused interface protects attention. [1]"\n\nevent: done\ndata: {}\n\n',
      }),
    );
    await page.goto("/app");
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
    const pageNumber = page.getByRole("textbox", {
      name: "Page number",
      exact: true,
    });
    await pageNumber.fill("2");
    await pageNumber.press("Enter");
    await expect(page.locator('[data-page="2"] canvas')).toBeVisible();
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
    const selection = page.getByRole("toolbar", {
      name: "Selected text actions",
    });
    await selection
      .getByRole("button", { name: "Ask AI", exact: true })
      .click();
    const prompt = selection.getByRole("textbox", {
      name: "Ask about selected passage",
    });
    await prompt.fill("Explain this selected passage");
    await prompt.press("Enter");
    const card = page.getByRole("complementary", {
      name: "Notebook assistant",
    });
    await expect(card).toBeVisible();
    await expect(page.locator(".message.assistant")).toContainText(
      "protects attention",
    );
    const handle = page.getByRole("button", { name: "Move answer card" });
    await handle.click();
    await expect(card).not.toHaveClass(/floating/);
    const initial = await card.boundingBox();
    const grip = await handle.boundingBox();
    await page.mouse.move(grip!.x + 20, grip!.y + 12);
    await page.mouse.down();
    await page.mouse.move(
      grip!.x - (mobile ? -25 : 280),
      grip!.y + (mobile ? -100 : 90),
      { steps: 12 },
    );
    await page.mouse.up();
    await expect(card).toHaveClass(/floating/);
    const moved = await card.boundingBox();
    // Desktop's full-height card has little vertical slack; horizontal movement
    // and viewport containment are the meaningful invariants there.
    if (mobile) expect(Math.abs(moved!.y - initial!.y)).toBeGreaterThan(30);
    if (!mobile) expect(moved!.x).toBeLessThan(initial!.x - 100);
    await handle.press("ArrowUp");
    await expect
      .poll(async () => Math.round((await card.boundingBox())!.y))
      .toBe(Math.round(Math.max(8, moved!.y - 16)));
    await page.setViewportSize({ width: 390, height: 700 });
    await expect
      .poll(async () => {
        const box = await card.boundingBox();
        return (
          box!.x >= 0 &&
          box!.x + box!.width <= 390 &&
          box!.y >= 0 &&
          box!.y + box!.height <= 700
        );
      })
      .toBe(true);
    await page.screenshot({
      path: `test-results/answer-card-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Return card to margin" }).click();
    await expect(card).not.toHaveClass(/floating/);
    await expect(handle).toBeFocused();
    await handle.press("ArrowLeft");
    await expect(card).toHaveClass(/floating/);
    await expect(pageNumber).toHaveValue("2");
    await handle.press("Home");
    await expect(card).not.toHaveClass(/floating/);
    await page
      .getByRole("button", { name: "Close assistant", exact: true })
      .click();
    await expect(card).toBeHidden();
  });
}
