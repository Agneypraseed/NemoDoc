import { test, expect } from "./fixtures";
import { createApp } from "../../server/app.ts";
import type { AddressInfo } from "node:net";
import { runtimeRoster, runtimeSessions } from "../fixtures/agent-monitor";

test("agent overview shows multiple agents, filters live work and refreshes without inference", async ({
  page,
}) => {
  let phase = "running",
    inference = 0;
  const calls: string[][] = [];
  const app = createApp(
    {
      apiKey: "fixture",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/test-nemotron",
    },
    (async () => {
      inference++;
      throw new Error("Monitoring cannot run inference");
    }) as typeof fetch,
    {
      nemoclawSandbox: "nemodoc",
      nemoclawReader: async (args) => {
        calls.push(args);
        if (phase === "offline") throw new Error("private runtime diagnostic");
        if (args.includes("agents")) return JSON.stringify(runtimeRoster);
        const sessions = structuredClone(runtimeSessions);
        if (phase === "completed") {
          Object.assign(sessions.sessions[0], {
            status: "done",
            hasActiveRun: false,
          });
          sessions.sessions[0].observerDigest!.headline =
            "Revision summary ready for review";
        }
        return JSON.stringify(sessions);
      },
    },
  );
  await app.locals.workspace.ready;
  app.locals.agent.data.state.runs.push({
    id: "overview-local",
    taskId: "local-task",
    notebookId: "welcome",
    title: "Selected study notes",
    status: "running",
    startedAt: 1792230000000,
    answer: "",
    connection: {
      baseUrl: "http://localhost:18789/v1",
      model: "openclaw/nemodoc",
    },
    steps: [
      {
        tool: "search_sources",
        summary: "Retrieved three approved note excerpts",
        at: 1792230001000,
      },
    ],
    citations: [],
    materials: [],
    sent: { memoryIds: [], sourceIds: [], skill: "", prompt: "" },
    calls: 1,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await page.route("**/api/agent**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const response = await fetch(base + url.pathname + url.search, {
      method: request.method(),
      headers: { "Content-Type": "application/json" },
      body: request.postData() || undefined,
    });
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  try {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(/NemoDoc/i);
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    const overview = page.getByRole("region", { name: "Agent overview" });
    await expect(
      overview.getByText("NemoClaw connected", { exact: true }),
    ).toBeVisible();
    await expect(overview.getByRole("article")).toHaveCount(3);
    const study = overview.getByRole("article", {
      name: "Study partner agent",
    });
    const research = overview.getByRole("article", {
      name: "Research scout agent",
    });
    await expect(study).toContainText("Working");
    const animation = study.getByRole("figure", {
      name: "Study partner activity animation: Working",
    });
    await expect(animation).toHaveAttribute("data-state", "running");
    await expect
      .poll(() =>
        animation.evaluate(
          (el) =>
            el
              .getAnimations({ subtree: true })
              .filter((a) => a.playState === "running").length,
        ),
      )
      .toBeGreaterThan(0);
    await overview
      .getByRole("button", { name: "Agent animations", exact: true })
      .click();
    await expect(animation).toHaveAttribute("data-motion", "off");
    await expect
      .poll(() =>
        animation.evaluate((el) => el.getAnimations({ subtree: true }).length),
      )
      .toBe(0);
    await overview
      .getByRole("button", { name: "Agent animations", exact: true })
      .click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(() =>
        animation.evaluate((el) => el.getAnimations({ subtree: true }).length),
      )
      .toBe(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect
      .poll(() =>
        animation.evaluate((el) => el.getAnimations({ subtree: true }).length),
      )
      .toBeGreaterThan(0);
    await expect(research.getByRole("figure")).toHaveAttribute(
      "data-state",
      "waiting",
    );

    await expect(study).toContainText(
      "Reading selected notes and checking citations",
    );
    await expect(research).toContainText("Needs you");
    await expect(
      overview.getByRole("article", { name: "Coordinator agent" }),
    ).toContainText("Failed");
    await expect(
      overview.getByRole("list", { name: "Notebook agent activity" }),
    ).toContainText("Selected study notes");
    await overview
      .getByText("View 1 recent tool step", { exact: true })
      .click();
    await expect(
      overview.getByRole("list", { name: "Notebook agent activity" }),
    ).toContainText("search_sources");
    await page.locator(".agent-panel").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: "output/agent-overview.png" });
    await study.scrollIntoViewIfNeeded();
    await study.screenshot({ path: "output/agent-working.png" });
    await overview
      .getByRole("button", { name: "View Research scout activity" })
      .click();
    const feed = overview.getByRole("list", { name: "Runtime agent activity" });
    await expect(feed).toContainText("Compare research papers");
    await expect(feed).not.toContainText("Morning revision");
    await overview
      .getByRole("button", { name: "All agents ×", exact: true })
      .click();
    await expect(feed).toContainText("Morning revision");
    await overview
      .getByRole("button", { name: "Show working sessions" })
      .click();
    await expect(feed).toContainText("Morning revision");
    await expect(feed).not.toContainText("Compare research papers");
    await expect(
      overview.getByRole("heading", { name: "Activity", exact: true }),
    ).toBeFocused();
    await overview
      .getByRole("searchbox", { name: "Search activity" })
      .fill("not a real task");
    await expect(
      overview.getByText(
        "No activity matches these filters. Try another search or clear filters.",
      ),
    ).toBeVisible();
    await overview
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await overview
      .getByLabel("Activity status", { exact: true })
      .selectOption("waiting");
    await expect(feed).toContainText("Compare research papers");
    await expect(feed).not.toContainText("Morning revision");
    await overview
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await overview
      .getByRole("searchbox", { name: "Search activity" })
      .fill("  research  ");
    await expect(feed).toContainText("Compare research papers");
    await expect(feed).not.toContainText("Morning revision");
    await overview
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await overview
      .getByRole("searchbox", { name: "Search activity" })
      .scrollIntoViewIfNeeded();
    expect(
      await overview.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: "output/agent-activity-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await overview
      .getByRole("searchbox", { name: "Search activity" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: "output/agent-activity-desktop.png" });
    phase = "completed";
    await expect(study).toContainText("Revision summary ready for review", {
      timeout: 15000,
    });
    await expect(study).toContainText("Completed");
    await expect(study.getByRole("figure")).toHaveAttribute(
      "data-state",
      "completed",
    );
    await expect
      .poll(() =>
        study
          .getByRole("figure")
          .evaluate((el) => el.getAnimations({ subtree: true }).length),
      )
      .toBe(0);
    phase = "offline";
    await expect(
      overview.getByText("Connect your NemoClaw runtime", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(overview.getByRole("article")).toHaveCount(0);
    await expect(
      overview.getByText(
        "Live session activity is unavailable until runtime monitoring is connected.",
        { exact: true },
      ),
    ).toBeVisible();
    await overview
      .getByRole("button", { name: "This notebook", exact: true })
      .click();
    await expect(
      overview.getByRole("list", { name: "Notebook agent activity" }),
    ).toContainText("Selected study notes");
    await page.setViewportSize({ width: 640, height: 1000 });
    expect(
      await overview.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await overview
      .getByRole("button", { name: "Set up agent connection", exact: true })
      .click();
    await expect(page.getByLabel("Model connection")).toBeVisible();
    expect(inference).toBe(0);
    expect(
      calls.every(
        (args) => args.includes("list") || args.includes("sessions.list"),
      ),
    ).toBe(true);
  } finally {
    app.locals.agent.stop();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await app.locals.workspace.repository.close();
  }
});

test("agent overview displays an API error without a fake connected state", async ({
  page,
}) => {
  await page.route("**/api/agent/overview?*", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Runtime status is temporarily unavailable" },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  const overview = page.getByRole("region", { name: "Agent overview" });
  await expect(overview.getByRole("alert")).toContainText(
    "Runtime status is temporarily unavailable",
  );
  await expect(
    overview.getByText("NemoClaw connected", { exact: true }),
  ).toHaveCount(0);
  await expect(
    overview.getByRole("button", { name: "Refresh agents" }),
  ).toBeEnabled();
});

test("work animation stops when the last runtime snapshot becomes stale", async ({
  page,
}) => {
  let unavailable = false;
  await page.route("**/api/agent/overview?*", (route) =>
    route.fulfill(
      unavailable
        ? {
            status: 503,
            json: { error: "Runtime connection lost" },
          }
        : {
            json: {
              runtime: {
                status: "connected",
                source: "nemoclaw",
                checkedAt: Date.now(),
                message: "Fixture runtime",
                sandbox: "fixture",
                hasMore: false,
                agents: [
                  { id: "study", name: "Study partner", isDefault: true },
                ],
                activity: [
                  {
                    id: "session",
                    agentId: "study",
                    title: "Review notes",
                    summary: "Reading notes",
                    status: "running",
                  },
                ],
              },
              connection: {
                mode: "openclaw",
                model: "openclaw/study",
                tested: true,
              },
              notebookActivity: [],
            },
          },
    ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  const overview = page.getByRole("region", { name: "Agent overview" });
  const scene = overview.getByRole("figure");
  await expect(scene).toHaveAttribute("data-state", "running");
  unavailable = true;
  await overview
    .getByRole("button", { name: "Refresh agents", exact: true })
    .click();
  await expect(overview.getByRole("alert")).toContainText(
    "Runtime connection lost",
  );
  await expect(scene).toHaveAttribute("data-state", "unknown");
  await expect(scene).toContainText("Activity unavailable");
  await expect
    .poll(() =>
      scene.evaluate((el) => el.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  unavailable = false;
  await overview
    .getByRole("button", { name: "Refresh agents", exact: true })
    .click();
  await expect(scene).toHaveAttribute("data-state", "running");
});
