import { test, expect } from "./fixtures";

test("responsive navigation keeps notebook identity and tools reachable", async ({
  page,
}) => {
  await page.route("**/api/agent", (route) =>
    route.fulfill({
      json: {
        sources: [],
        memories: [],
        tasks: [],
        runs: [],
        plans: [],
        skills: [],
        materials: [],
      },
    }),
  );
  await page.goto("/app");
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  for (const width of [320, 390, 700, 960, 1440, 1536]) {
    const height = width === 1536 ? 1024 : 900;
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole("heading", { name: "The thoughtful interface" }),
    ).toBeVisible();
    const header = page.locator(".workspace-header");
    expect(
      await header.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    for (const name of ["Chat", "Notes", "Studio", "Agent"]) {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await button.click();
      const panel = page.getByRole("complementary", {
        name: "Notebook assistant",
      });
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      expect(panelBox!.x).toBeGreaterThanOrEqual(0);
      expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(width);
      expect(panelBox!.y).toBeGreaterThanOrEqual(0);
      expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(height);
      const composer = await page.locator(".workspace-chat").boundingBox();
      expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(composer!.y);
      if (width === 390 || width === 1440 || width === 1536)
        await page.screenshot({
          path: `test-results/design-${name.toLowerCase()}-${width}.png`,
        });
      await page.getByRole("button", { name: "Close assistant" }).click();
    }
    const detail = page.getByRole("combobox", { name: "Answer detail" });
    await detail.focus();
    await detail.press("d");
    await detail.press("Enter");
    await expect(detail).toHaveValue("deep");
    await detail.selectOption("quick");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your notebook" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close assistant" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const close = settings.getByRole("button", { name: "Close dialog" });
  const closeBox = await close.boundingBox();
  const dialogBox = await settings.boundingBox();
  expect(closeBox!.y).toBeGreaterThanOrEqual(dialogBox!.y);
  expect(closeBox!.y).toBeLessThan(dialogBox!.y + 80);
  await page.screenshot({ path: "test-results/design-settings-mobile.png" });
  await close.click();
  await expect(settings).toBeHidden();
});
