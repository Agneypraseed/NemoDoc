import { test, expect } from "./fixtures";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { createApp } from "../../server/app.ts";
import { SettingsStore } from "../../server/settings.ts";
import { mmlCases, mmlPrompt } from "../fixtures/mml-workspace.ts";
import { createEvidenceProposal } from "./workspace-helpers";

test("real Nemotron MML study workflow: upload, share, run, inspect, edit, approve and import twice", async ({
  browser,
}) => {
  test.skip(
    process.env.NEMODOC_MML_WORKFLOWS_LIVE !== "1",
    "Explicitly opt in to real NVIDIA calls and provide the local MML PDF and an isolated PostgreSQL database.",
  );
  test.setTimeout(600000);
  for (const key of ["TEST_DATABASE_URL", "TEST_READ_DATABASE_URL"]) {
    const url = new URL(process.env[key] || "postgresql://invalid/invalid");
    expect(["127.0.0.1", "localhost", "[::1]"]).toContain(url.hostname);
    expect(url.pathname).toMatch(/_test$/);
  }
  const book = path.resolve(
    process.env.NEMODOC_MML_BOOK || "data/mml-book.pdf",
  );
  expect(existsSync(book)).toBe(true);
  const settings = new SettingsStore(
    {
      apiKey: "",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/Nemotron-3_5-Lightning",
    },
    "data/settings.json",
  );
  expect(settings.value.apiKey).toBeTruthy();
  const app = createApp(settings.value, fetch, {
    databaseUrl: process.env.TEST_DATABASE_URL,
    readDatabaseUrl: process.env.TEST_READ_DATABASE_URL,
  });
  await app.locals.workspace.ready;
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    recordVideo: {
      dir: "output/mml-live-video",
      size: { width: 1600, height: 1000 },
    },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let success = false;
  // Forward actual workspace responses to the isolated backend; no inference/data responses are fabricated.
  await context.route("**/api/agent**", async (route) => {
    const request = route.request();
    const response = await fetch(api + new URL(request.url()).pathname, {
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
    await page.goto("/");
    await page
      .getByRole("button", { name: "New notebook", exact: true })
      .click();
    const title = `MML live acceptance ${Date.now()}`;
    await page.getByRole("textbox", { name: "Notebook title" }).fill(title);
    await page
      .getByRole("button", { name: "Create notebook", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Upload sources", { exact: true })
      .setInputFiles(book);
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible({
      timeout: 120000,
    });
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await page.getByRole("button", { name: "Notebook", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Notebook notes", exact: true })
      .fill(
        "SYNTHETIC MML acceptance notes: A basis is a linearly independent generating set (PDF page 50). A norm satisfies absolute homogeneity, triangle inequality and positive definiteness (PDF page 77). No real quiz history is claimed.",
      );
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    const flow = page.getByRole("region", { name: "Evidence workflows" });
    await flow
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("checkbox")
      .check();
    await flow
      .getByRole("group", { name: "Notes", exact: true })
      .getByRole("checkbox")
      .check();
    await flow
      .getByLabel("I approve storing these selected snapshots on this server.")
      .check();
    await flow
      .getByRole("button", { name: "Approve snapshots", exact: true })
      .click();
    await expect(
      flow.getByRole("button", { name: "Create proposal", exact: true }),
    ).toBeVisible();
    for (const [name, caseId] of [["Plan revision", "study-01"]]) {
      await flow.getByRole("button", { name, exact: true }).click();
      await flow.getByRole("textbox", { name: "Request", exact: true }).fill(
        mmlPrompt(
          mmlCases.find((c) => c.id === caseId)!,
          Date.now() + 86400000,
        ),
      );
      const { run, article } = await createEvidenceProposal(
        page,
        flow,
        app.locals.workspace.worker,
        20000,
      );
      await article.getByText(/Queries, evidence/).click();
      await expect(article).toContainText("postgres");
      const repo = app.locals.workspace.repository;
      const notebookIds = await repo.ids();
      let state: any;
      for (const id of notebookIds) {
        const s = await repo.read(id);
        if (s.title === title) state = s;
      }
      expect(state).toBeTruthy();
      const cite = state.runs
        .find((r: any) => r.id === run.id)
        .citations.find((c: any) => c.page === 50);
      expect(cite).toBeTruthy();
      await article
        .getByLabel("Content", { exact: true })
        .first()
        .fill(
          `Edited MML acceptance guide: A basis is a linearly independent generating set. [${cite.id}]`,
        );
      await article
        .getByRole("button", { name: "Save edits for review" })
        .click();
      await expect(article).toContainText("revision 2");
      await article
        .getByRole("button", { name: "Approve selected actions" })
        .click();
      await expect(article).toContainText("approved");
      mkdirSync("output/mml-tests", { recursive: true });
      await page.screenshot({
        path: `output/mml-tests/${caseId}-approved.png`,
      });
    }
    const imports = flow.getByRole("button", { name: "Import into Studio" });
    await expect(imports).toHaveCount(1);
    await imports.first().click();
    await imports.first().click();
    await page.getByRole("button", { name: "Studio", exact: true }).click();
    await expect(
      page.getByLabel("Saved study material").locator("option"),
    ).toHaveCount(2);
    await page.reload();
    await page.getByRole("button", { name: "Studio", exact: true }).click();
    await expect(
      page.getByLabel("Saved study material").locator("option"),
    ).toHaveCount(2);
    expect(errors).toEqual([]);
    success = true;
  } finally {
    const video = page.video();
    await context.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
    if (success && video)
      copyFileSync(await video.path(), "output/mml-live-walkthrough.webm");
    app.locals.workspace.worker.stop();
    await new Promise<void>((r) => server.close(() => r()));
    await app.locals.workspace.repository.close();
  }
});
