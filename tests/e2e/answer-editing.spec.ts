import { test, expect } from "./fixtures";
import { readFile } from "node:fs/promises";
test("edited answers stay consistent across chat, Notes, tables, export and reload without overwriting separate notes", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/chat", (route) => {
    calls++;
    return route.fulfill({
      contentType: "text/event-stream",
      body: 'event: sources\ndata: [{"id":1,"sourceId":"sample-paper","sourceName":"Designing for human attention.pdf","page":3,"text":"Vertical scrolling supports continuous reading."}]\n\nevent: delta\ndata: "Original explanation. [1]"\n\nevent: done\ndata: {}\n\n',
    });
  });
  await page.goto("/app");
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  const input = page.getByRole("textbox", {
    name: "Ask about your sources",
    exact: true,
  });
  await input.fill("Explain attention");
  await input.press("Enter");
  const answer = page.locator(".message.assistant");
  await answer
    .getByRole("button", { name: "Edit answer", exact: true })
    .click();
  await answer
    .getByRole("textbox", { name: "Answer text", exact: true })
    .fill("Discard this");
  await answer
    .getByRole("textbox", { name: "Answer text", exact: true })
    .press("Escape");
  await expect(answer).toContainText("Original explanation");
  await answer
    .getByRole("button", { name: "Edit answer", exact: true })
    .click();
  await answer
    .getByRole("textbox", { name: "Answer text", exact: true })
    .fill(
      "Revised explanation. [1]\n\n| Topic | Meaning |\n| --- | --- |\n| Focus | Continuous reading [1] |",
    );
  await page.screenshot({ path: "output/answer-editing-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "output/answer-editing-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await answer
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(answer.getByRole("table")).toContainText("Continuous reading");
  await answer
    .getByRole("button", { name: "Save to Notes", exact: true })
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  const saved = page.locator(".saved-answer-card");
  await saved.locator("summary").first().click();
  await saved.getByRole("button", { name: "Edit answer", exact: true }).click();
  await saved
    .getByRole("textbox", { name: "Answer text", exact: true })
    .fill("Second revision. [1]");
  await saved
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  const notes = page.getByRole("textbox", {
    name: "Notebook notes",
    exact: true,
  });
  await expect(notes).toHaveValue(/Second revision/);
  await notes.fill(
    (await notes.inputValue()).replace(
      "Second revision",
      "My separate notebook wording",
    ),
  );
  await page.getByRole("button", { name: /^Answers/ }).click();
  await saved.locator("summary").first().click();
  await saved.getByRole("button", { name: "Edit answer", exact: true }).click();
  await saved
    .getByRole("textbox", { name: "Answer text", exact: true })
    .fill("Third revision. [1] [Unknown](#citation-999)");
  await saved
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(saved.getByRole("status")).toContainText("preserved");
  await expect(saved).toContainText("Unknown (source unavailable)");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Notebook actions", exact: true })
    .click();
  await page.getByRole("button", { name: "Export notes", exact: true }).click();
  const file = await (await event).path();
  const markdown = await readFile(file!, "utf8");
  expect(markdown).toContain("Third revision");
  expect(markdown).toContain("My separate notebook wording");
  await page.reload();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(answer).toContainText("Third revision");
  await expect(answer).toContainText("Unknown (source unavailable)");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await expect(notes).toHaveValue(/My separate notebook wording/);
  await page.route("**/api/study", (route) =>
    route.fulfill({
      json: {
        kind: "guide",
        title: "Attention guide",
        content: "Original guide [1].",
        items: [],
        citations: [
          {
            id: 1,
            sourceId: "sample-paper",
            sourceName: "Designing for human attention.pdf",
            page: 3,
            text: "Vertical scrolling supports continuous reading.",
          },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Study guide", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Study guide content", exact: true })
    .fill("My edited guide [1].");
  await page
    .getByRole("button", { name: "Edit study material", exact: true })
    .click();
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await page
    .getByRole("button", { name: "study: Attention guide", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open in Studio", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Study material", exact: true }),
  ).toContainText("My edited guide");
  expect(calls).toBe(1);
});
