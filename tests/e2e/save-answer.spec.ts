import { test, expect } from "@playwright/test";

test("interrupted answer stays unsaveable after reload and backup restore", async ({
  page,
}) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: 'event: delta\ndata: "An unfinished answer"\n\n',
    }),
  );
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Ask about your sources" });
  await input.fill("Explain attention");
  await input.press("Enter");
  await expect(page.locator(".message.assistant")).toContainText(
    "An unfinished answer",
  );
  await expect(
    page.getByText("The answer was interrupted. Please try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to Notes" })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.locator(".message.assistant")).toContainText(
    "An unfinished answer",
  );
  await expect(page.getByRole("button", { name: "Save to Notes" })).toHaveCount(
    0,
  );
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Notebook actions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back up notebook", exact: true })
    .click();
  const file = await (await downloading).path();
  await page
    .getByLabel("Restore notebook backup", { exact: true })
    .setInputFiles(file!);
  await expect(page.getByRole("status")).toContainText("1 notebook restored");
  await page.getByRole("button", { name: /^All notebooks/ }).click();
  await page
    .getByRole("button", { name: /The thoughtful interface \(restored\)/ })
    .click();
  await expect(page.locator(".message.assistant")).toContainText(
    "An unfinished answer",
  );
  await expect(page.getByRole("button", { name: "Save to Notes" })).toHaveCount(
    0,
  );
});
