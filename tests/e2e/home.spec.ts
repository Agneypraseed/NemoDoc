import { test, expect } from "./fixtures";

test("homepage previews are interactive and start notebook creation", async ({
  page,
}) => {
  const errors: string[] = [];
  const apiRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your personal notebook",
  );
  const navigation = page.getByRole("navigation", {
    name: "Main navigation",
  });
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "How it works", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open NemoDoc", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#how-it-works")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Get started", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#features, .home-privacy")).toHaveCount(0);
  const preview = page.getByRole("region", {
    name: "Interactive product preview",
  });
  const panel = page.getByRole("complementary", {
    name: "Example feature panel",
  });
  const highlight = preview.getByRole("button", { name: "Remove highlight" });
  await expect(highlight).toHaveAttribute("aria-pressed", "true");
  await highlight.click();
  await expect(
    preview.getByRole("button", { name: "Highlight passage" }),
  ).toHaveAttribute("aria-pressed", "false");
  await preview.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(panel).toContainText(
    "Context gives you a way to check your interpretation.",
  );
  await panel
    .getByRole("button", { name: /The art of paying attention · p. 04/ })
    .click();
  await expect(
    preview.getByRole("article", { name: "Example document" }),
  ).toContainText("Keep the context.");
  await expect(
    preview.getByRole("button", { name: "Read & annotate", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await preview
    .getByRole("button", { name: "Study tools", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(panel).toContainText("It makes the idea traceable.");
  await panel
    .getByRole("button", { name: "Show question", exact: true })
    .click();
  await expect(panel).toContainText(
    "Why does context make a note more useful?",
  );
  await preview.getByRole("button", { name: "Agents", exact: true }).click();
  await panel
    .getByRole("button", { name: "Preview a workflow", exact: true })
    .click();
  await expect(panel.getByRole("figure")).toHaveAttribute(
    "data-state",
    "running",
  );
  await expect(panel.getByRole("status")).toHaveText("Reading selected notes");
  await panel
    .getByRole("button", { name: "Preview animations", exact: true })
    .click();
  await expect(panel.getByRole("figure")).toHaveAttribute("data-motion", "off");
  await panel
    .getByRole("button", { name: "Preview animations", exact: true })
    .click();
  await expect(panel.getByRole("figure")).toHaveAttribute("data-motion", "on");
  await panel.getByRole("button", { name: "Next step", exact: true }).click();
  await panel.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(panel.getByRole("figure")).toHaveAttribute(
    "data-state",
    "waiting",
  );
  await expect(panel.getByRole("status")).toHaveText("Ready for your review");
  await panel
    .getByRole("button", { name: "Restart preview", exact: true })
    .click();
  await expect(panel.getByRole("figure")).toHaveAttribute(
    "data-state",
    "queued",
  );
  await page
    .getByText("How do I keep a copy of my work?", { exact: true })
    .click();
  await expect(page.getByText(/Device sync is not automatic/)).toBeVisible();
  expect(apiRequests).toEqual([]);
  await preview
    .getByRole("button", { name: "Read & annotate", exact: true })
    .click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "output/home-desktop.png", fullPage: true });
  await page
    .getByRole("button", { name: "Create a notebook", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("dialog", { name: "New notebook" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Notebook title" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your personal notebook",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Your personal notebook",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create a notebook", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Notebook title" }).fill("From home");
  await page.getByRole("button", { name: "Create notebook" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: "From home", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your personal notebook",
  );
  expect(errors).toEqual([]);
});

test("homepage navigation, feature demos, and FAQ work on a small screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "How it works", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#how-it-works")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Get started", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#features, .home-privacy")).toHaveCount(0);
  const preview = page.getByRole("region", {
    name: "Interactive product preview",
  });
  await preview
    .getByRole("button", { name: "Study tools", exact: true })
    .click();
  await preview
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(preview).toContainText("It makes the idea traceable.");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "output/home-mobile.png", fullPage: true });
  await page
    .getByRole("button", { name: "Create a notebook", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("dialog", { name: "New notebook" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Notebook title" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your personal notebook",
      exact: true,
    }),
  ).toBeVisible();
});
