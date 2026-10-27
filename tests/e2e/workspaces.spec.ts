import { test, expect } from "./fixtures";
import { createApp } from "../../server/app.ts";
import type { AddressInfo } from "node:net";
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { scriptedModel } from "../fixtures/evidence-workspace.ts";
import { createEvidenceProposal } from "./workspace-helpers";

async function createResearchSources() {
  mkdirSync("output/workflow-fixtures", { recursive: true });
  const create = async (name: string, text: string) => {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage(),
      font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText(text, { x: 50, y: 720, size: 12, font });
    const file = path.resolve(`output/workflow-fixtures/${name}.pdf`);
    writeFileSync(file, await pdf.save());
    return file;
  };
  return Promise.all([
    create(
      "ritchie-primary-school",
      "Synthetic Ritchie et al. paper excerpt. Retrieval practice and mind mapping were studied with primary-school children. Retrieval practice improved factual learning after delayed testing. This classroom result does not establish an effect in workplace training.",
    ),
    create(
      "okano-workplace-learning",
      "Synthetic Okano et al. paper excerpt. Digital learning among workplace employees. Interspersed testing with structured discussion improved next-day retention; spontaneous discussion alone did not show the same significant effect. This setting is not a head-to-head comparison with a primary-school study.",
    ),
  ]);
}

test("both evidence workflows: explicit snapshot, inspect queries, edit, approve and import into Studio", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: process.env.RECORD_WORKFLOWS
      ? { dir: "output/workflow-video", size: { width: 1440, height: 1000 } }
      : undefined,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  let completed = false;
  page.on("pageerror", (e) => errors.push(e.message));
  const app = createApp(
    {
      apiKey: "fixture-key",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/test-nemotron",
    },
    scriptedModel(),
    {
      databaseUrl: process.env.TEST_DATABASE_URL,
      readDatabaseUrl: process.env.TEST_READ_DATABASE_URL,
    },
  );
  await app.locals.workspace.ready;
  if (app.locals.workspace.repository.kind === "postgres")
    await app.locals.workspace.repository.pool.query(
      "DELETE FROM workspace_notebooks WHERE id=$1",
      ["welcome"],
    );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await context.route("**/api/agent**", async (route) => {
    const request = route.request();
    // Deliberately exercise a slower queue commit, as on PostgreSQL CI.
    if (new URL(request.url()).pathname === "/api/agent/workspace/run")
      await new Promise((resolve) => setTimeout(resolve, 200));
    const response = await fetch(url + new URL(request.url()).pathname, {
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
    await page.goto("http://127.0.0.1:5173/app");
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible({
      timeout: 15000,
    });
    await page
      .getByLabel("Upload sources", { exact: true })
      .setInputFiles(await createResearchSources());
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await page.getByRole("button", { name: "Notebook", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Notebook notes", exact: true })
      .fill(
        "Attention is finite. Keep source evidence beside the ideas I save.",
      );
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page.getByRole("button", { name: "Research team", exact: true }).click();
    const flow = page.getByRole("region", { name: "Evidence workflows" });
    await expect(flow).toBeVisible();
    const sourceChoices = flow
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("checkbox");
    await expect(sourceChoices).toHaveCount(3);
    await sourceChoices.nth(1).check();
    await sourceChoices.nth(2).check();
    await flow
      .getByRole("group", { name: "Notes", exact: true })
      .getByRole("checkbox")
      .first()
      .check();
    await flow
      .getByLabel("I approve storing these selected snapshots on this server.")
      .check();
    await flow
      .getByRole("button", { name: "Approve snapshots", exact: true })
      .click();
    await expect(
      flow.getByRole("button", { name: "Generate team plan", exact: true }),
    ).toBeVisible();
    for (const name of ["Plan revision", "Synthesize research"]) {
      await flow
        .getByLabel("Task type", { exact: true })
        .selectOption(
          name === "Plan revision" ? "study_revision" : "research_synthesis",
        );
      await flow
        .getByLabel("Request", { exact: true })
        .fill(
          name === "Plan revision"
            ? "Prepare a revision plan from my notes and quiz mistakes."
            : "Compare the findings, methods and limits of my selected papers.",
        );
      const { article } = await createEvidenceProposal(
        page,
        flow,
        app.locals.workspace.worker,
      );
      await article.getByText(/Queries, evidence/).click();
      await expect(article).toContainText("query_notes");
      if (name === "Synthesize research") {
        await expect(
          article.getByRole("region", { name: "Research evidence report" }),
        ).toBeVisible();
        await expect(article.getByRole("table").getByRole("row")).toHaveCount(
          3,
        );
        await expect(article).toContainText("Ritchie");
        await expect(article).toContainText("Okano");
        await expect(article).toContainText("Qualifies");
      }
      await article.getByText(/\[1\] notes/).click();
      await page.screenshot({
        path: `output/${name === "Plan revision" ? "study" : "research"}-evidence.png`,
      });
      const content = article.getByLabel("Content", { exact: true }).first();
      await content.fill(
        "Edited, cited guide: protect attention and keep the original passage close. [2]",
      );
      await article
        .getByRole("button", { name: "Save edits for review" })
        .click();
      await expect(article).toContainText("revision 2");
      await article
        .getByRole("button", { name: "Approve selected actions" })
        .click();
      await expect(article).toContainText("approved");
    }
    const imports = flow.getByRole("button", { name: "Import into Studio" });
    await expect(imports).toHaveCount(2);
    await imports.first().click();
    await imports.first().click();
    await imports.last().click();
    await page.getByRole("button", { name: "Studio", exact: true }).click();
    await expect(
      page.getByLabel("Saved study material").locator("option"),
    ).toHaveCount(3);
    expect(errors).toEqual([]);
    completed = true;
  } catch (error) {
    console.error("Workflow browser failure:", error);
    throw error;
  } finally {
    const video = page.video();
    await context.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
    if (process.env.RECORD_WORKFLOWS && video && completed) {
      mkdirSync("docs/demo", { recursive: true });
      copyFileSync(
        await video.path(),
        path.resolve("docs/demo/evidence-workflows.webm"),
      );
    }
    app.locals.workspace.worker.stop();
    await app.locals.workspace.repository.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
