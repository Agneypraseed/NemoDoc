import { test, expect } from "./fixtures";

test("local agent activity shows tasks and filters without inference", async ({
  page,
}) => {
  let inferenceCalls = 0;
  await page.route("**/chat/completions", async (route) => {
    inferenceCalls++;
    await route.abort();
  });
  await page.route("**/api/agent/overview?*", (route) =>
    route.fulfill({
      json: {
        connection: {
          mode: "notebook",
          model: "nvidia/test-nemotron",
          tested: true,
        },
        notebookActivity: [
          {
            id: "research-1",
            agentId: "researcher",
            kind: "workflow",
            title: "Research · Definitions",
            status: "completed",
            summary: "Reviewed approved source passages",
            updatedAt: 1000,
            model: "nvidia/test-nemotron",
            steps: [{ tool: "read_passage", summary: "Read page 1", at: 900 }],
            pendingApproval: false,
          },
          {
            id: "task-1",
            agentId: "notebook-agent",
            kind: "task",
            title: "Morning revision",
            status: "queued",
            summary: "Waiting for the worker",
            updatedAt: 500,
            model: "nvidia/test-nemotron",
            steps: [],
            pendingApproval: false,
          },
        ],
      },
    }),
  );
  await page.goto("/app");
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  await page.getByText("More", { exact: true }).click();
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  const activity = page.getByRole("region", { name: "Agent activity" });
  await expect(activity.getByText("Research · Definitions")).toBeVisible();
  await expect(activity.getByText("Morning revision")).toBeVisible();
  await activity.getByLabel("Search activity").fill("definitions");
  await expect(activity.getByText("Morning revision")).toHaveCount(0);
  await expect(activity.getByText("Research · Definitions")).toBeVisible();
  await activity.getByLabel("Search activity").fill("");
  await activity.getByLabel("Status").selectOption("queued");
  await expect(activity.getByText("Morning revision")).toBeVisible();
  await expect(activity.getByText("Research · Definitions")).toHaveCount(0);
  expect(inferenceCalls).toBe(0);
});
