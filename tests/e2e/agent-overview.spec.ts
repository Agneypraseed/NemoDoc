import { test, expect } from "./fixtures";

test("research is the default and activity stays in Dashboard without inference", async ({
  page,
}) => {
  let inferenceCalls = 0;
  await page.route("**/chat/completions", async (route) => {
    inferenceCalls++;
    await route.abort();
  });
  await page.route("**/api/agent/workspace/*/dashboard?*", (route) => {
    const now = Date.now();
    return route.fulfill({
      json: {
        notebookId: "fixture",
        since: now - 86400000,
        until: now,
        generatedAt: now,
        persistence: "local",
        truncated: false,
        traces: [
          {
            traceId: "research-1",
            name: "Definitions research",
            status: "completed",
            createdAt: now,
            kind: "research",
            models: [],
            toolCalls: 0,
            citationChecksPassed: 0,
            citationChecksFailed: 0,
          },
          {
            traceId: "task-1",
            name: "Morning revision",
            status: "queued",
            createdAt: now,
            kind: "task",
            models: [],
            toolCalls: 0,
            citationChecksPassed: 0,
            citationChecksFailed: 0,
          },
        ],
      },
    });
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Research a question", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Task type", { exact: true })).toHaveCount(0);
  await page.getByText("More", { exact: true }).click();
  await page
    .getByRole("button", { name: "Tasks & schedules", exact: true })
    .click();
  await expect(
    page.getByRole("form", { name: "New agent task" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Task activity" })).toHaveCount(
    0,
  );
  await page.getByText("More", { exact: true }).click();
  await page.getByRole("button", { name: "Study tools", exact: true }).click();
  await page
    .getByLabel("Task type", { exact: true })
    .selectOption("research_synthesis");
  await expect(page.getByLabel("Task type", { exact: true })).toHaveValue(
    "research_synthesis",
  );
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await expect(page.getByLabel("Task type", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const dashboard = page.getByRole("region", {
    name: "Agent dashboard",
    exact: true,
  });
  await expect(
    dashboard.getByRole("button", {
      name: "Inspect Definitions research",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dashboard.getByRole("button", {
      name: "Inspect Morning revision",
      exact: true,
    }),
  ).toBeVisible();
  await dashboard.getByLabel("Status", { exact: true }).selectOption("queued");
  await expect(
    dashboard.getByRole("button", {
      name: "Inspect Morning revision",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dashboard.getByRole("button", {
      name: "Inspect Definitions research",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(inferenceCalls).toBe(0);
});
