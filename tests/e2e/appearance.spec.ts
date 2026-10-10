import { test, expect } from "@playwright/test";

async function waitForCover(page: import("@playwright/test").Page) {
  // The selectable text layer can finish before PDF.js paints the canvas.
  // Wait for the cover's original dark ink before checking or capturing it.
  await expect
    .poll(() =>
      page
        .locator('[data-page="1"] canvas')
        .evaluate((canvas: HTMLCanvasElement) => {
          const pixels = canvas
            .getContext("2d")!
            .getImageData(
              0,
              0,
              canvas.width,
              Math.floor(canvas.height * 0.4),
            ).data;
          let ink = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (
              pixels[i] < 100 &&
              pixels[i + 1] < 100 &&
              pixels[i + 2] < 100 &&
              pixels[i + 3] > 0
            )
              ink++;
          }
          return ink;
        }),
    )
    .toBeGreaterThan(1000);
}

test("clean workspace, persistent sidebar, theme and saved model attribution", async ({
  page,
}) => {
  let model = "nvidia/Nemotron-3_5-Lightning";
  let saves = 0;
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { configured: true, local: false, model } }),
  );
  await page.route("**/api/settings", (route) => {
    if (route.request().method() === "POST") {
      model = route.request().postDataJSON().model;
      saves++;
    }
    return route.fulfill({
      json: {
        baseUrl: "https://api.tokenfactory.nebius.com/v1",
        model,
        embeddingBaseUrl: "",
        embeddingModel: "",
        visionBaseUrl: "",
        visionModel: "",
        rerankUrl: "",
        rerankModel: "",
        semantic: false,
        rerank: false,
        hasApiKey: true,
      },
    });
  });
  await page.goto("/");
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  await expect(
    page.locator('[data-page="1"] .textLayer span').first(),
  ).toBeVisible();
  await waitForCover(page);
  await page.screenshot({
    path: "test-results/workspace-light.png",
    fullPage: true,
  });
  await expect(page.locator(".local-card, .model-chip, .profile")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".model-attribution")).toHaveText(
    "Powered by Nemotron 3.5 Lightning",
  );
  const sidebar = page.getByRole("complementary", { name: "Notebook sidebar" });
  await page
    .getByRole("button", { name: "Close sidebar", exact: true })
    .click();
  await expect(sidebar).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Open sidebar", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(sidebar).toBeHidden();
  await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  await expect(sidebar).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText(/hackathon|prototyping|MVP/)).toHaveCount(0);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".modal")).toHaveCSS(
    "background-color",
    "rgb(29, 32, 40)",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.locator('[data-page="1"] .textLayer span').first(),
  ).toBeVisible();
  await waitForCover(page);
  await page.screenshot({
    path: "test-results/workspace-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Model", { exact: true })
    .fill("nvidia/nemotron-test-super");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(
    page.getByText("Connection saved.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".model-attribution")).toHaveText(
    "Powered by Nemotron Test Super",
  );
  await expect(page.locator(".document-page").first()).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page
    .getByRole("button", { name: "Notebook actions", exact: true })
    .click();
  await expect(
    page.getByText("Markdown document (.md)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Sources, notes & chat (.zip)", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Notebook actions", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Export notes", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect(saves).toBe(1); // Appearance changes never save provider credentials.
});

test("system theme follows the OS and mobile sidebar closes accessibly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const sidebar = page.getByRole("complementary", { name: "Notebook sidebar" });
  await expect(sidebar).toBeHidden();
  await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  await expect(sidebar).toBeVisible();
  await page
    .getByRole("button", { name: "Close sidebar", exact: true })
    .click();
  await expect(sidebar).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Open sidebar", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "System", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Notebook actions", exact: true })
    .click();
  const popover = await page.locator(".notebook-actions-popover").boundingBox();
  expect(popover!.x).toBeGreaterThanOrEqual(0);
  expect(popover!.x + popover!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/workspace-mobile.png",
    fullPage: true,
  });
});
