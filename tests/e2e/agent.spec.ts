import { test, expect } from "./fixtures";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../../server/app.ts";

test("personal agent remembers preferences, reuses skills, runs while browser is closed and saves cited results to Studio", async ({
  page,
  context,
}) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-agent-browser-"));
  let inferenceCalls = 0;
  const app = createApp(
    {
      apiKey: "browser-test-key",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/test-nemotron",
    },
    (async (_url, init) => {
      inferenceCalls++;
      const body = JSON.parse(String(init?.body));
      const results = body.messages.filter((m: any) => m.role === "tool");
      let message;
      const tool = (name: string, args: unknown) => ({
        content: null,
        tool_calls: [
          {
            id: "call-" + name,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
      if (!results.length)
        message = tool("search_sources", { query: "overview" });
      else if (results.length === 1)
        message = tool("update_plan", {
          text: "Review interface feedback tomorrow, then practice recall.",
        });
      else if (results.length === 2)
        message = tool("save_study_material", {
          kind: "guide",
          title: "Personal study guide",
          content: "Study the principle in this passage. [1]",
          items: [],
        });
      else message = { content: "Your study guide and plan are saved. [1]" };
      return Response.json({ id: "test-response", choices: [{ message }] });
    }) as typeof fetch,
    {
      agentFile: path.join(directory, "agent.json"),
      workspaceFile: path.join(directory, "workspace.json"),
      traceSpoolFile: path.join(directory, "traces.jsonl"),
    },
  );
  await app.locals.workspace.ready;
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await context.route("**/api/agent**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const response = await route.fetch({
      url: apiUrl + url.pathname + url.search,
      timeout: 10000,
      maxRetries: 0,
    });
    await route.fulfill({ response });
  });
  try {
    await page.goto("/app");
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page.locator(".agent-more-nav > summary").click();
    await page.getByRole("button", { name: "Memory", exact: true }).click();
    await page.getByRole("button", { name: "Add memory", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Memory", exact: true })
      .fill("I prefer 20-minute study sessions.");
    await page.getByLabel("Memory type").selectOption("preference");
    await page
      .getByRole("button", { name: "Save memory", exact: true })
      .click();
    await expect(page.locator(".agent-memory")).toContainText("20-minute");
    await page
      .getByRole("button", { name: "Edit memory", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Memory", exact: true })
      .fill("I prefer 25-minute study sessions.");
    await page
      .getByRole("button", { name: "Save memory", exact: true })
      .click();
    await expect(page.locator(".agent-memory")).toContainText("25-minute");
    await page.locator(".agent-more-nav > summary").click();
    await page.getByRole("button", { name: "Skills", exact: true }).click();
    await page.getByRole("button", { name: "New skill", exact: true }).click();
    await page
      .getByLabel("Skill name", { exact: true })
      .fill("My focused review");
    await page
      .getByLabel("Skill instructions", { exact: true })
      .fill(
        "Search sources, save a cited guide and update a plan using my study preferences.",
      );
    await page.getByRole("button", { name: "Save skill", exact: true }).click();
    await expect(page.locator(".agent-skill").last()).toContainText(
      "My focused review",
    );
    await page.locator(".agent-more-nav > summary").click();
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    const checkboxes = page.locator(".agent-panel").getByRole("checkbox");
    await checkboxes.first().check();
    await checkboxes.last().check();
    await page
      .getByRole("button", { name: "Save source permissions", exact: true })
      .click();
    await expect(page.locator(".agent-source-cache")).toContainText(
      "Currently approved",
    );
    await page.getByRole("button", { name: "Research", exact: true }).click();
    await page
      .getByText("Scheduled tasks & activity inbox", { exact: true })
      .click();
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page
      .getByLabel("Task name", { exact: true })
      .fill("Browser closed review");
    const skill = app.locals.agent.data.state.skills.find(
      (s: any) => s.name === "My focused review",
    );
    await page
      .getByRole("combobox", { name: "Reusable skill", exact: true })
      .selectOption(skill.id);
    await page
      .getByLabel("What should I do?", { exact: true })
      .fill("Make a short study guide and update my plan.");
    await page.getByRole("button", { name: "Run task", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Task queued");
    const task = app.locals.agent.data.state.tasks[0];
    // Ensure it becomes due only after the browser tab has closed.
    task.dueAt = Date.now() + 2500;
    app.locals.agent.data.flush();
    await page.close();
    await expect
      .poll(() => app.locals.agent.data.state.runs[0]?.status, {
        timeout: 12000,
      })
      .toBe("completed");
    expect(inferenceCalls).toBe(4);
    const next = await context.newPage();
    await next.goto("/app");
    await next.getByRole("button", { name: "Agent", exact: true }).click();
    await next.getByRole("button", { name: "Research", exact: true }).click();
    await next
      .getByText("Scheduled tasks & activity inbox", { exact: true })
      .click();
    await expect(next.locator("article.agent-result")).toContainText(
      "Your study guide and plan are saved.",
    );
    await next
      .getByText("Personal study guide · guide", { exact: true })
      .click();
    await next
      .getByRole("button", { name: "Save to Studio", exact: true })
      .click();
    await next.getByRole("button", { name: "Studio", exact: true }).click();
    await next
      .getByRole("combobox", { name: "Saved study material", exact: true })
      .selectOption({ label: "Personal study guide · guide" });
    await expect(
      next.getByText("Personal study guide", { exact: true }).first(),
    ).toBeVisible();
    await next.getByRole("button", { name: "Agent", exact: true }).click();
    await next.locator(".agent-more-nav > summary").click();
    await next.getByRole("button", { name: "Sources", exact: true }).click();
    await next
      .getByRole("button", { name: "Revoke all notebook sources", exact: true })
      .click();
    expect(app.locals.agent.data.state.sources.length).toBe(0);
    await next.locator(".agent-more-nav > summary").click();
    await next.getByRole("button", { name: "Memory", exact: true }).click();
    await next
      .getByRole("button", { name: "Delete memory", exact: true })
      .click();
    await expect(next.locator(".agent-memory")).toHaveCount(0);
    await next.getByRole("button", { name: "Research", exact: true }).click();
    await next.screenshot({
      path: "test-results/agent-desktop.png",
      fullPage: true,
    });
    await next.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        next
          .locator(".sidebar")
          .evaluate((el) => Math.round(el.getBoundingClientRect().right)),
      )
      .toBe(0);
    await next.screenshot({
      path: "test-results/agent-mobile.png",
      fullPage: true,
    });
    expect(
      await next.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
    app.locals.agent.stop();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await app.locals.workspace.repository.close();
    expect(
      path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep),
    ).toBe(true);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("connection presets and model catalog select exact model IDs", async ({
  page,
}) => {
  await page.route("**/api/models*", (route) =>
    route.fulfill({
      json: {
        provider: "nebius",
        models: route.request().url().includes("capability=vision")
          ? ["nvidia/nemotron-nano-12b-v2-vl"]
          : [
              "nvidia/Nemotron-3_5-Lightning",
              "nvidia/nemotron-test-super",
              "nvidia/nemotron-nano-12b-v2-vl",
            ],
      },
    }),
  );
  await page.goto("/app");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Nebius", exact: true }).click();
  await expect(page.getByLabel("Chat API base URL")).toHaveValue(
    "https://api.tokenfactory.nebius.com/v1",
  );
  await expect(page.getByLabel("Embedding model ID")).toHaveValue("");
  await page.getByText("OCR & images", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Image model" })).toHaveValue(
    "openbmb/MiniCPM-V-4_5",
  );
  await page
    .getByRole("button", {
      name: "Refresh models",
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", { name: "Chat & study model" })
    .selectOption("nvidia/nemotron-test-super");
  await expect(
    page.getByRole("combobox", { name: "Chat & study model" }),
  ).toHaveValue("nvidia/nemotron-test-super");
  await expect(
    page
      .getByRole("combobox", { name: "Chat & study model" })
      .getByRole("option", {
        name: /Nemotron Nano 12B V2 VL · Vision/,
      }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Refresh image models" }).click();
  await page
    .getByRole("combobox", { name: "Image model" })
    .selectOption("nvidia/nemotron-nano-12b-v2-vl");
  await page
    .getByRole("button", { name: "NVIDIA hosted", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Local inference", exact: true })
    .click();
  await expect(page.getByLabel("Chat API base URL")).toHaveValue(
    "http://127.0.0.1:8000/v1",
  );
});
