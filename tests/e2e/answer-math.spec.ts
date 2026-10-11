import { test, expect } from "@playwright/test";

test("lecture answers render equations without breaking citations or saved notes", async ({
  page,
}) => {
  const answer =
    "The rank counts independent columns: $\\mathrm{rk}(A) = \\dim(U)$. [1]\n\n$$\n0 \\leq \\mathrm{rk}(A) \\leq \\min(m,n)\n$$\n\nThis bound follows the matrix dimensions. [1]";
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `event: sources\ndata: ${JSON.stringify([{ id: 1, sourceId: "sample-paper", sourceName: "Designing for human attention.pdf", page: 2, text: "An isolated math-rendering fixture." }])}\n\nevent: delta\ndata: ${JSON.stringify(answer)}\n\nevent: done\ndata: {}\n\n`,
    }),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Ask about your sources", exact: true })
    .fill("Define rank");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  const message = page.locator(".message.assistant");
  await expect(message.locator(".katex")).toHaveCount(2);
  await expect(message.locator(".katex-display")).toBeVisible();
  await expect(message.locator(".katex-error")).toHaveCount(0);
  await expect(message.locator(".inline-citation")).toHaveCount(2);
  await message.locator(".inline-citation").first().click();
  await expect(
    page.getByRole("textbox", { name: "Page number", exact: true }),
  ).toHaveValue("2");
  await page
    .getByRole("button", { name: "Save to Notes", exact: true })
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Notebook notes", exact: true }),
  ).toContainText("$\\mathrm{rk}(A) = \\dim(U)$");
});
