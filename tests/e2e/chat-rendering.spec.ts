import { test, expect } from "./fixtures";

for (const mode of ["quick", "deep"] as const) {
  test(`${mode} chat preserves literal prompts and renders structured answers on mobile`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const question =
      "Explain **this phrase** literally.\nKeep my wording and $symbols$.";
    const longValue = "a_long_identifier_".repeat(30);
    const answer = `## A clear answer\n\nAn explanation with **emphasis** and evidence. [1]\n\n> A useful quotation.\n\n| Topic | Detail |\n| --- | --- |\n| Reading | ${longValue} |\n\n\`\`\`js\nconst value = "${longValue}";\n\`\`\`\n\n- First point\n- Second point`;
    let rewriteCalls = 0;
    const requests: { question: string; answerMode: string }[] = [];
    await page.route("**/api/prompt/rewrite", (route) => {
      rewriteCalls++;
      return route.abort();
    });
    await page.route("**/api/chat", (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({
        contentType: "text/event-stream",
        body: `event: sources\ndata: ${JSON.stringify([{ id: 1, sourceId: "sample-paper", sourceName: "Designing for human attention.pdf", page: 2, text: "Evidence fixture." }])}\n\nevent: delta\ndata: ${JSON.stringify(answer)}\n\nevent: done\ndata: {}\n\n`,
      });
    });
    await page.goto("/app");
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible({
      timeout: 15000,
    });
    await page.getByLabel("Answer detail", { exact: true }).selectOption(mode);
    const input = page.getByRole("textbox", {
      name: "Ask about your sources",
      exact: true,
    });
    await input.fill(question);
    await input.press("Enter");
    const user = page.locator(".message.user");
    const response = page.locator(".message.assistant");
    await expect(
      response.getByRole("heading", { name: "A clear answer" }),
    ).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ question, answerMode: mode });
    expect(rewriteCalls).toBe(0);
    expect(await user.locator(".message-question").textContent()).toBe(
      question,
    );
    await expect(user.locator("strong, .katex")).toHaveCount(0);
    await expect(response.getByRole("table")).toHaveCount(1);
    await expect(response.locator("pre code")).toContainText(longValue);
    await expect(response.locator(".inline-citation")).toHaveCount(1);
    expect(
      await response.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `output/chat-rendering-${mode}-mobile.png` });
    await page.reload();
    await expect(page.locator(".message-question")).toHaveText(question);
    await expect(page.locator(".message.assistant h2")).toHaveText(
      "A clear answer",
    );
  });
}
