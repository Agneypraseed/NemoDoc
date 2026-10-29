import { test, expect } from "./fixtures";
test("quiz progress survives reload and personalizes a cited guide and follow-up practice", async ({
  page,
}) => {
  const requests: any[] = [];
  let shared = 0;
  await page.route("**/api/agent/memory", (route) => {
    shared++;
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/study", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const citation = {
      id: 1,
      sourceId: "sample-paper",
      sourceName: "Designing for human attention.pdf",
      page: 3,
      text: "Vertical scrolling supports continuous reading.",
    };
    const questions = body.focus
      ? [...body.focus.map((f: any) => f.question), "Apply the ideas together?"]
      : [
          "What supports continuous reading?",
          "What reduces distraction?",
          "Why preserve context?",
        ];
    return route.fulfill({
      json: {
        kind: body.kind,
        title: body.focus
          ? body.kind === "guide"
            ? "Your targeted guide"
            : "Focused practice"
          : "Attention quiz",
        content:
          body.kind === "guide"
            ? "Review the missed concepts using continuous reading [1]."
            : "",
        items:
          body.kind === "guide"
            ? []
            : questions.map((q: string, i: number) => ({
                question: q,
                answer: "Supported explanation [1].",
                choices: [`Correct choice ${i}`, `Other choice ${i}`],
                correct: 0,
                citationIds: [1],
              })),
        citations: [citation],
        ...(body.focus
          ? { focusQuestions: body.focus.map((f: any) => f.question) }
          : {}),
      },
    });
  });
  await page.goto("/app");
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  const groups = page.locator(".study-quiz fieldset");
  await groups.nth(0).getByRole("radio").nth(0).check();
  await groups.nth(1).getByRole("radio").nth(1).check();
  await groups.nth(2).getByRole("radio").nth(1).check();
  await page
    .getByRole("button", { name: "Check answers", exact: true })
    .click();
  const progress = page.getByRole("region", {
    name: "Your learning",
    exact: true,
  });
  await expect(progress).toContainText("Last score: 1/3");
  await expect(progress).toContainText("2 questions to revisit");
  await page.reload();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(progress).toContainText("Last score: 1/3");
  await progress.getByText("Review missed questions", { exact: true }).click();
  await progress
    .getByRole("button", { name: /Designing for human attention.pdf.*Page 3/ })
    .first()
    .click();
  await expect(page.locator('[data-page="3"] canvas')).toBeVisible();
  await progress
    .getByRole("button", { name: "Create targeted guide", exact: true })
    .click();
  const material = page.getByRole("region", {
    name: "Study material",
    exact: true,
  });
  await expect(material).toContainText("Your targeted guide");
  await expect(
    material.getByRole("heading", { name: "Your targeted guide", exact: true }),
  ).toBeInViewport();
  await expect(material).toContainText("continuous reading");
  expect(requests[1].focus).toHaveLength(2);
  expect(requests[1].focus[0].selectedAnswer).toContain("Other choice");
  expect(
    requests[1].focus.every((f: any) =>
      f.references.every(
        (r: any) => r.sourceId === "sample-paper" && r.page === 3,
      ),
    ),
  ).toBe(true);
  await page.screenshot({ path: "output/learning-progress-desktop.png" });
  await progress
    .getByRole("button", { name: "Practice missed topics", exact: true })
    .click();
  await expect(material).toContainText("Focused practice");
  await groups.nth(0).getByRole("radio").nth(0).check();
  await groups.nth(1).getByRole("radio").nth(0).check();
  await groups.nth(2).getByRole("radio").nth(0).check();
  await page
    .getByRole("button", { name: "Check answers", exact: true })
    .click();
  await expect(progress).toContainText("Last score: 3/3");
  await expect(progress).toContainText("No missed questions");
  await page.reload();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(progress).toContainText("2 recorded quizzes");
  await expect(progress).toContainText("No missed questions");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "output/learning-progress-mobile.png" });
  expect(shared).toBe(0);
  expect(requests).toHaveLength(3);
});
