import { test, expect } from "@playwright/test";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/app.ts";

test("one research form saves a scheduled team with its instructions and manages the job", async ({
  browser,
}) => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-unified-"));
  let inferenceCalls = 0;
  const app = createApp(
    {
      apiKey: "fixture-key",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: "nvidia/test-nemotron",
    },
    (async () => {
      inferenceCalls++;
      throw new Error("A future job must not infer yet");
    }) as typeof fetch,
    {
      agentFile: path.join(directory, "agent.json"),
      workspaceFile: path.join(directory, "workspace.json"),
      traceSpoolFile: path.join(directory, "trace.jsonl"),
    },
  );
  await app.locals.workspace.ready;
  app.use(express.static(path.resolve("dist")));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const page = await context.newPage();
  try {
    await page.goto(api + "/app");
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    const form = page.getByRole("form", { name: "New agent task" });
    await expect(
      form.getByRole("button", { name: "Automatic team", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await form
      .getByLabel("What should I do?", { exact: true })
      .fill("Review my source every day and summarize changes.");
    await form
      .getByLabel("Agent instructions", { exact: true })
      .fill("Explain changes with precise citations.");
    await form.getByText("Specialist instructions", { exact: true }).click();
    await form
      .getByLabel("Notebook researcher", { exact: true })
      .fill("Check each changed definition.");
    await form.getByText("Sources & files", { exact: true }).click();
    await form.getByText("Choose notebook sources", { exact: true }).click();
    const sourcePicker = form.locator(".agent-inline-sources");
    await sourcePicker.getByRole("checkbox").first().check();
    await sourcePicker.getByLabel(/Store the selected extracted text/).check();
    await sourcePicker
      .getByRole("button", { name: "Save source permissions", exact: true })
      .click();
    await expect(form).toBeVisible();
    await expect
      .poll(
        async () =>
          (await (await fetch(api + "/api/agent")).json()).sources.length,
      )
      .toBeGreaterThan(0);
    await form.getByText("Choose notebook sources", { exact: true }).click();

    await form.getByLabel("Add a text file", { exact: true }).setInputFiles({
      name: "definitions.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "Synthetic source: a vector has magnitude and direction.",
      ),
    });
    await expect(
      form.getByLabel("definitions.md", { exact: false }),
    ).toBeChecked();
    await form.getByText("Schedule & delivery", { exact: true }).click();
    await form
      .getByLabel("Start time (leave blank to run now)", { exact: true })
      .fill("2099-01-01T08:00");
    await form.getByLabel("Repeat", { exact: true }).selectOption("24");
    await form
      .getByRole("button", { name: "Schedule task", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Agent dashboard", exact: true }),
    ).toBeVisible();
    const state = await (await fetch(api + "/api/agent")).json();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({
      allowDelegation: true,
      instructions: "Explain changes with precise citations.",
      repeatHours: 24,
      agentInstructions: { researcher: "Check each changed definition." },
    });
    expect(state.tasks[0].fileIds).toHaveLength(1);
    expect(state.tasks[0].sourceIds.length).toBeGreaterThan(0);
    expect(state.runs).toHaveLength(0);
    await page.getByText("More", { exact: true }).click();
    await page
      .getByRole("button", { name: "Tasks & schedules", exact: true })
      .click();
    await expect(form).toBeHidden();
    await expect(
      page.getByRole("heading", {
        name: "Review my source every day and summarize changes.",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Resume", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: "output/unified-agent-schedules.png" });
    await page.reload();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await expect(
      form.getByLabel("Agent instructions", { exact: true }),
    ).toHaveValue("Explain changes with precise citations.");
    await page.screenshot({ path: "output/unified-agent-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "output/unified-agent-mobile.png" });
    expect(inferenceCalls).toBe(0);
  } finally {
    await context.close();
    app.locals.agent.stop();
    app.locals.workspace.worker.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.locals.traceStore.close();
    await app.locals.workspace.repository.close();
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== path.resolve(tmpdir()) ||
      !path.basename(resolved).startsWith("nemodoc-unified-")
    )
      throw new Error("Unexpected fixture directory");
    rmSync(resolved, { recursive: true, force: true });
  }
});
