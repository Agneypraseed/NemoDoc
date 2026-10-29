import { test, expect } from "./fixtures";

test("library searches, sorts, creates and reopens persisted notebooks", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Sample notebook" }),
  ).toBeVisible();
  for (const [title, description] of [
    ["Algebra", "Vector spaces"],
    ["Zoology", "Field observations"],
  ]) {
    await page.getByRole("button", { name: /^All notebooks/ }).click();
    await page
      .getByRole("dialog", { name: "Your notebooks" })
      .getByRole("button", { name: "New notebook" })
      .click();
    await page.getByLabel("Notebook title").fill(title);
    await page.getByLabel(/Description/).fill(description);
    await page
      .getByRole("button", { name: "Create notebook", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: /^All notebooks/ }).click();
  const library = page.getByRole("dialog", { name: "Your notebooks" });
  await expect(library.locator(".library-row strong")).toHaveText([
    "Algebra",
    "Sample notebook",
    "Zoology",
  ]);
  await library
    .getByRole("combobox", { name: "Sort notebooks" })
    .selectOption("newest");
  await expect(library.locator(".library-row strong").first()).toHaveText(
    "Zoology",
  );
  await library
    .getByRole("textbox", { name: "Find a notebook" })
    .fill("vector");
  await expect(library.locator(".library-row")).toHaveCount(1);
  await expect(library.locator(".library-row strong")).toHaveText("Algebra");
  await library
    .getByRole("textbox", { name: "Find a notebook" })
    .fill("no matching notebook");
  await expect(
    library.getByText("No notebooks match your search."),
  ).toBeVisible();
  await library.getByRole("button", { name: "Clear search" }).click();
  await expect(library.locator(".library-row")).toHaveCount(3);
  await page.screenshot({ path: "test-results/library-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(library).toBeVisible();
  expect(
    await library.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/library-mobile.png" });
  await library.getByRole("button", { name: /Algebra/ }).click();
  await expect(library).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("heading", { name: "Algebra", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Algebra", exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "All notebooks", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "output/home-notebooks-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Create a notebook", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "output/home-notebooks-mobile.png" });
  await page.getByRole("link", { name: "All notebooks", exact: true }).click();
  await expect(library).toBeVisible();
  await expect(library.locator(".library-row")).toHaveCount(3);
  await library.getByRole("button", { name: /Zoology/ }).click();
  await expect(
    page.getByRole("heading", { name: "Zoology", exact: true }),
  ).toBeVisible();
});
