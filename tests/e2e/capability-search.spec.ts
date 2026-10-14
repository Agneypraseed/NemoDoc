import { test, expect } from "./fixtures";
import { openReaderTools } from "./reader-tools";

for (const mobile of [false, true]) {
  test(`passage dots reopen chat and notes keep their topic on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    if (mobile) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: "dark" });
    }
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        contentType: "text/event-stream",
        body: 'event: sources\ndata: [{"id":1,"sourceId":"sample-paper","sourceName":"Designing for human attention.pdf","page":2,"text":"Every interface asks for a little of our attention."}]\n\nevent: delta\ndata: "Attention is limited, so interfaces should reduce distraction. [1]"\n\nevent: done\ndata: {}\n\n',
      }),
    );
    await page.goto("/");
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
    await text.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.locator(".page-scroller").dispatchEvent("mouseup");
    await page
      .getByRole("toolbar", { name: "Selected text actions" })
      .getByRole("button", { name: "Explain", exact: true })
      .click();
    const assistant = page.getByRole("complementary", {
      name: "Notebook assistant",
    });
    await expect(assistant).toContainText("Attention is limited");
    await expect(assistant.locator(".message-passage-label")).toHaveText(
      "Cited a passage",
    );
    await expect(assistant.locator(".message-passage-quote")).toContainText(
      "Every interface",
    );
    await page
      .getByRole("button", { name: "Add to Notes", exact: true })
      .click();
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await expect(page.locator(".saved-answer-summary strong")).toContainText(
      "Explain · Every interface",
    );
    await page
      .getByRole("button", { name: "Close assistant", exact: true })
      .click();
    const marker = page.getByRole("button", {
      name: "Open passage note: Explain this passage.",
      exact: true,
    });
    // Click near the dot, inside its generous hit target, not only its tiny center.
    for (let i = 0; i < 3; i++) {
      await marker.click({ position: { x: 4, y: 14 } });
      await expect(assistant).toBeVisible();
      await expect(assistant).toContainText("Attention is limited");
      await expect(
        page.getByRole("toolbar", { name: "Selected text actions" }),
      ).toBeHidden();
      await page
        .getByRole("button", { name: "Close assistant", exact: true })
        .click();
    }
    await openReaderTools(page);
    await page.getByRole("button", { name: "Book view", exact: true }).click();
    await marker.click();
    await expect(assistant).toContainText("Attention is limited");
    await expect
      .poll(async () => (await assistant.boundingBox())!.width)
      .toBeLessThan(700);
    await page.screenshot({
      path: `test-results/passage-topic-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.reload();
    if (await assistant.isVisible())
      await page
        .getByRole("button", { name: "Close assistant", exact: true })
        .click();
    await page
      .getByRole("button", {
        name: "Open passage note: Explain this passage.",
        exact: true,
      })
      .click();
    await expect(assistant).toContainText("Attention is limited");
  });

  test(`notes search and EmbeddingGemma setup work on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    if (mobile) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: "dark" });
    }
    const settings = {
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/Nemotron-3_5-Lightning",
      hasApiKey: true,
      embeddingBaseUrl: "https://api.tokenfactory.nebius.com/v1",
      embeddingModel: "",
      semantic: false,
      visionBaseUrl: "https://api.tokenfactory.nebius.com/v1",
      visionModel: "openbmb/MiniCPM-V-4_5",
      rerank: false,
      rerankModel: "",
      rerankUrl: "https://api.tokenfactory.nebius.com/v1/rerank",
    };
    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "POST")
        Object.assign(settings, route.request().postDataJSON());
      await route.fulfill({ json: settings });
    });
    await page.route("**/api/settings/test/embeddings", (route) =>
      route.fulfill({ json: { ok: true, model: "embeddinggemma-2:270m" } }),
    );
    let search: any;
    await page.route("**/api/search/notes", (route) => {
      search = route.request().postDataJSON();
      return route.fulfill({
        json: {
          mode: "semantic",
          results: search.notes.filter((note: any) => note.kind === "notebook"),
        },
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await page.getByRole("button", { name: "Notebook", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Notebook notes", exact: true })
      .fill("My study note: avoid distractions to protect concentration.");
    await page
      .getByRole("button", { name: "Search ideas", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Notes", exact: true }).click();
    await dialog
      .getByRole("textbox", { name: "Search notebook ideas" })
      .fill("How do I focus?");
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    await expect(dialog.locator(".semantic-results")).toContainText(
      "protect concentration",
    );
    expect(search.notes[0].text).toContain("My study note");
    await dialog.locator(".semantic-results > button").click();
    await expect(
      page.getByRole("textbox", { name: "Notebook notes", exact: true }),
    ).toHaveValue(/protect concentration/);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Use EmbeddingGemma 2 locally" })
      .click();
    await expect(
      page.getByLabel("Embedding model ID", { exact: true }),
    ).toHaveValue("embeddinggemma-2:270m");
    await expect(
      page.getByLabel("Embedding API base URL", { exact: true }),
    ).toHaveValue("http://127.0.0.1:11434/v1");
    await page
      .getByRole("button", { name: "Save & test embeddings", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Embeddings connected" }),
    ).toContainText("Embeddings connected");
    expect(settings.model).toBe("nvidia/Nemotron-3_5-Lightning");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/embedding-settings-${mobile ? "mobile" : "desktop"}.png`,
    });
  });
}
