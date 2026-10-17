import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/app.ts";
import { connectionInput } from "../../server/agent-connections.ts";
import { agentConfigRuntime } from "../fixtures/agent-config";

async function setup(page: Page) {
  const native = agentConfigRuntime();
  let inference = 0;
  const app = createApp(
    {
      apiKey: "fixture",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/test-nemotron",
    },
    (async (url, init) => {
      if (init?.method === "POST" || String(url).includes("chat/completions"))
        inference++;
      if (String(url).endsWith("/models"))
        return Response.json({
          data: [{ id: "openclaw/nemodoc" }, { id: "openclaw/research" }],
        });
      throw new Error("Settings must not invoke inference");
    }) as typeof fetch,
    { nemoclawSandbox: "nemodoc", nemoclawReader: native.run },
  );
  await app.locals.workspace.ready;
  app.locals.agent.connections.save(
    connectionInput.parse({
      section: "model",
      mode: "openclaw",
      baseUrl: "http://127.0.0.1:18789/v1",
      model: "openclaw/nemodoc",
      apiKey: "fixture-gateway",
    }),
  );
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
  return {
    native,
    app,
    inference: () => inference,
    close: async () => {
      app.locals.agent.stop();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await app.locals.workspace.repository.close();
    },
  };
}
async function openSettings(page: Page) {
  await page.goto("/app");
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  await page
    .getByRole("button", { name: "Configure roles & models", exact: true })
    .click();
  return page.getByRole("region", { name: "Agent configuration" });
}

test("agent settings assign separate models, ordered fallbacks and native Markdown roles; drafts survive agent switches", async ({
  page,
}) => {
  const h = await setup(page);
  try {
    const settings = await openSettings(page);
    await expect(
      settings.getByLabel("Configure agent", { exact: true }),
    ).toHaveValue("nemodoc");
    await settings
      .getByLabel("Primary model", { exact: true })
      .selectOption("nvidia/research");
    await settings
      .getByLabel("Fallback model ID", { exact: true })
      .fill("ollama/gemma");
    await settings
      .getByRole("button", { name: "Add fallback", exact: true })
      .click();
    await settings
      .getByLabel("Fallback model ID", { exact: true })
      .fill("nvidia/study");
    await settings
      .getByRole("button", { name: "Add fallback", exact: true })
      .click();
    await settings.getByRole("button", { name: "Move fallback 2 up" }).click();
    await settings
      .getByRole("button", { name: "Save model routing", exact: true })
      .click();
    await expect(settings.getByRole("status")).toContainText(
      "Model routing saved",
    );
    expect(h.native.agents.nemodoc.model).toEqual({
      primary: "nvidia/research",
      fallbacks: ["nvidia/study", "ollama/gemma"],
    });
    expect(h.native.agents.research.model).toEqual({
      primary: "nvidia/research",
      fallbacks: ["nvidia/study"],
    });
    await settings
      .getByRole("button", { name: "Reload applied models", exact: true })
      .click();
    await settings
      .getByRole("button", { name: "Edit role files", exact: true })
      .click();
    const text = settings.getByLabel("AGENTS.md content", { exact: true });
    await expect(text).toHaveValue(/Keep existing local conventions/);
    await settings
      .getByLabel("Role template", { exact: true })
      .selectOption("Reviewer");
    await settings
      .getByRole("button", { name: "Insert role template", exact: true })
      .click();
    await expect(text).toHaveValue(/# Role: Reviewer/);
    const draft =
      (await text.inputValue()) + "\nKeep the draft across agent switches.\n";
    await text.fill(draft);
    await settings
      .getByLabel("Configure agent", { exact: true })
      .selectOption("research");
    await expect(
      settings.getByLabel("AGENTS.md content", { exact: true }),
    ).toHaveValue("# Research agent\n");
    await settings
      .getByLabel("Configure agent", { exact: true })
      .selectOption("nemodoc");
    await expect(text).toHaveValue(draft);
    await settings
      .getByRole("button", { name: "Preview Markdown", exact: true })
      .click();
    await expect(
      settings.getByLabel("AGENTS.md preview", { exact: true }),
    ).toContainText("Role: Reviewer");
    await page.screenshot({ path: "output/agent-role-editor.png" });
    await settings
      .getByRole("button", { name: "Edit Markdown", exact: true })
      .click();
    await settings
      .getByRole("button", { name: "Save AGENTS.md", exact: true })
      .click();
    await expect(settings.getByRole("status")).toContainText("AGENTS.md saved");
    expect(h.native.files.get("nemodoc:AGENTS.md")).toBe(draft);
    await settings
      .getByRole("button", { name: "SOUL.md", exact: true })
      .click();
    const soul = settings.getByLabel("SOUL.md content", { exact: true });
    await expect(soul).toHaveValue("# Personality\n\nPatient and direct.\n");
    await soul.fill(
      "# Personality\n\nExplain uncertainty clearly and keep the tone calm.\n",
    );
    await settings
      .getByRole("button", { name: "Save SOUL.md", exact: true })
      .click();
    await expect(settings.getByRole("status")).toContainText("SOUL.md saved");
    expect(h.native.files.get("nemodoc:AGENTS.md")).toBe(draft);
    await page.reload();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page
      .getByRole("button", { name: "Configure roles & models", exact: true })
      .click();
    await expect(text).toHaveValue(draft);
    await settings
      .getByLabel("New agent name", { exact: true })
      .fill("Paper reviewer");
    await settings
      .getByRole("button", { name: "Create agent", exact: true })
      .click();
    await expect(
      settings.getByLabel("Configure agent", { exact: true }),
    ).toHaveValue("paper-reviewer");
    expect((h.native.agents["paper-reviewer"].tools as any).profile).toBe(
      "minimal",
    );
    await settings
      .getByLabel("Primary model", { exact: true })
      .selectOption("__exact__");
    await settings
      .getByLabel("Exact primary model ID", { exact: true })
      .fill("nvidia/exact-model");
    await settings
      .getByRole("button", { name: "Save model routing", exact: true })
      .click();
    await expect(
      settings.getByText("Model routing saved.", { exact: false }).first(),
    ).toBeVisible();
    expect(h.native.agents["paper-reviewer"].model?.primary).toBe(
      "nvidia/exact-model",
    );
    await page.locator(".agent-panel").evaluate((el) => {
      el.scrollTop = 220;
    });
    await page.screenshot({ path: "output/agent-configuration.png" });
    await settings
      .getByLabel("Configure agent", { exact: true })
      .selectOption("research");
    await settings
      .getByRole("button", { name: "Use this agent in NemoDoc", exact: true })
      .click();
    await expect(
      page.getByLabel("OpenClaw agent target", { exact: true }),
    ).toHaveValue("openclaw/research");
    expect(h.inference()).toBe(0);
  } finally {
    await h.close();
  }
});

test("a stale role save preserves the draft and a disconnected runtime offers connection setup", async ({
  page,
}) => {
  const h = await setup(page);
  try {
    const settings = await openSettings(page);
    const text = settings.getByLabel("AGENTS.md content", { exact: true });
    await expect(text).toHaveValue(/Keep existing local conventions/);
    await text.fill("# My unsaved role\n");
    h.native.files.set("nemodoc:AGENTS.md", "External OpenClaw edit\n");
    await settings
      .getByRole("button", { name: "Save AGENTS.md", exact: true })
      .click();
    await expect(settings.getByRole("alert")).toContainText(
      "changed since you opened",
    );
    await expect(text).toHaveValue("# My unsaved role\n");
    await settings
      .getByRole("button", { name: "Reload file", exact: true })
      .click();
    await expect(
      settings
        .getByRole("alert")
        .filter({ hasText: "Discard unsaved changes" }),
    ).toBeVisible();
    await settings
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(text).toHaveValue("# My unsaved role\n");
    await settings
      .getByRole("button", { name: "Reload file", exact: true })
      .click();
    await settings
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(text).toHaveValue("External OpenClaw edit\n");
    h.native.behavior.unavailable = true;
    await settings
      .getByRole("button", { name: "Reload agents", exact: true })
      .click();
    await expect(
      settings.getByText("Agent configuration needs your runtime host", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      settings.getByLabel("Configure agent", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await h.close();
  }
});
