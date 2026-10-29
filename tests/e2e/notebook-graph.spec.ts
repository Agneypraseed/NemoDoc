import { test, expect } from "./fixtures";
test("saved study notes connect to their source and remain navigable after reload", async ({
  page,
}) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: 'event: sources\ndata: [{"id":1,"sourceId":"sample-paper","sourceName":"Designing for human attention.pdf","page":3,"text":"Vertical scrolling supports continuous reading."}]\n\nevent: delta\ndata: "Vertical scrolling supports continuous reading. [1]"\n\nevent: done\ndata: {}\n\n',
    }),
  );
  await page.goto("/app");
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  const input = page.getByRole("textbox", {
    name: "Ask about your sources",
    exact: true,
  });
  await input.fill("Explain attention");
  await input.press("Enter");
  await page
    .getByRole("button", { name: "Save to Notes", exact: true })
    .click();
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  const graph = page.getByRole("region", {
    name: "Notebook connections",
    exact: true,
  });
  await graph
    .getByRole("button", { name: "note: Explain attention", exact: true })
    .click();
  await expect(
    graph.getByRole("region", { name: "Selected connection" }),
  ).toContainText("continuous reading");
  await graph
    .getByRole("button", { name: /Designing for human attention.pdf.*Page 3/ })
    .click();
  await expect(page.locator('[data-page="3"] canvas')).toBeVisible();
  await graph.getByRole("button", { name: "Table", exact: true }).click();
  await expect(graph.getByRole("table")).toContainText("Explain attention");
  await graph.getByRole("searchbox").fill("no matching note");
  await expect(graph.getByRole("status")).toContainText("0 notes");
  await graph.getByRole("searchbox").fill("");
  await page.reload();
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(
    graph.getByRole("button", { name: "note: Explain attention", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  await page.screenshot({ path: "output/notebook-graph-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "output/notebook-graph-mobile.png" });
  await graph
    .getByRole("button", { name: "note: Explain attention", exact: true })
    .click();
  await graph.getByRole("button", { name: "Open note", exact: true }).click();
  await expect(page.locator('[id^="saved-answer-"]')).toContainText(
    "continuous reading",
  );
});
