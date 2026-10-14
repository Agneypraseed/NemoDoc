import { test, expect } from "./fixtures";
import { createApp } from "../../server/app.ts";
import type { AddressInfo } from "node:net";
import { mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";

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
    (async (_url, init) => {
      const body = JSON.parse(String(init?.body)),
        results = body.messages.filter((m: any) => m.role === "tool");
      const docs = JSON.parse(
        body.messages[0].content
          .split("Selected documents: ")[1]
          .split("\n")[0],
      );
      const tool = (name: string, args: unknown) => ({
        content: null,
        tool_calls: [
          {
            id: `call-${results.length}`,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
      const research = body.messages[0].content.includes("research_synthesis");
      const message = !results.length
        ? tool("query_notes", {})
        : results.length === 1
          ? tool("read_passage", { sourceId: docs[0].id, page: 2 })
          : results.length === 2
            ? tool("propose_actions", {
                actions: [
                  {
                    kind: "save_material",
                    materialKind: "guide",
                    title: research
                      ? "Research evidence brief"
                      : "Revision practice guide",
                    content:
                      "Keep the reader’s attention on their work; make evidence easy to revisit. [2]",
                    items: [],
                    evidenceIds: [1, 2],
                  },
                  {
                    kind: "update_plan",
                    text: "Revisit the original passage and compare it with your notes. [2]",
                    evidenceIds: [1, 2],
                  },
                ],
              })
            : {
                content:
                  "Your approved notes [1] and original passage [2] support this proposal. Review the proposed changes before approving.",
              };
      return Response.json({ choices: [{ message }] });
    }) as typeof fetch,
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
    const request = route.request(),
      response = await fetch(url + new URL(request.url()).pathname, {
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
    await page.goto("http://127.0.0.1:5173");
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await page.getByRole("button", { name: "Notebook", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Notebook notes", exact: true })
      .fill(
        "Attention is finite. Keep source evidence beside the ideas I save.",
      );
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    const flow = page.getByRole("region", { name: "Evidence workflows" });
    await expect(flow).toBeVisible();
    await flow
      .getByRole("group", { name: "Documents", exact: true })
      .getByRole("checkbox")
      .first()
      .check();
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
      flow.getByRole("button", { name: "Create proposal", exact: true }),
    ).toBeVisible();
    for (const name of ["Plan revision", "Synthesize research"]) {
      await flow.getByRole("button", { name, exact: true }).click();
      await flow
        .getByRole("button", { name: "Create proposal", exact: true })
        .click();
      await app.locals.workspace.worker.tick();
      const article = flow.locator("article").first();
      await expect(article.getByRole("heading").first()).toContainText(
        "completed",
      );
      await article.getByText(/Queries, evidence/).click();
      await expect(article).toContainText("query_notes");
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
