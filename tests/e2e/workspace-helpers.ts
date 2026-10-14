import { expect, type Locator, type Page } from "@playwright/test";
import type { WorkspaceWorker } from "../../server/workspace/worker.ts";
import type { WorkflowRun } from "../../src/workspace-types";

export async function createEvidenceProposal(
  page: Page,
  flow: Locator,
  worker: WorkspaceWorker,
  completionTimeout = 5000,
) {
  const queuedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/agent/workspace/run",
  );
  await flow
    .getByRole("button", { name: "Create proposal", exact: true })
    .click();
  // A click only dispatches the request. Wait for the queue transaction to
  // commit before manually ticking this test's otherwise stopped worker.
  const response = await queuedResponse;
  expect(response.ok()).toBe(true);
  const run = (await response.json()) as WorkflowRun;
  expect(run.id).toMatch(/^[a-f0-9-]{36}$/);
  await worker.tick();
  // A previous completed card must never satisfy assertions for this run.
  const article = flow.locator(`article[data-run-id="${run.id}"]`);
  await expect(article.getByRole("heading").first()).toContainText(
    "completed",
    { timeout: completionTimeout },
  );
  return { run, article };
}
