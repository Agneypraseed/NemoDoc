import { test as base, expect } from "@playwright/test";
import { emptyWorkspace } from "../../src/workspace-types";
/** Every ordinary browser scenario mocks prompt rewriting. It must never use
 * a developer's provider credential just because their local server is running. */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (!/^live |real Nemotron/i.test(testInfo.title)) {
      await page.route("**/api/agent/overview?*", (route) =>
        route.fulfill({
          json: {
            runtime: {
              status: "not_configured",
              source: "none",
              checkedAt: 0,
              message: "No runtime is connected in this browser fixture.",
              agents: [],
              activity: [],
              hasMore: false,
            },
            connection: {
              mode: "notebook",
              model: "nvidia/test-nemotron",
              tested: false,
            },
            notebookActivity: [],
          },
        }),
      );
      // A reused development server may contain an approved personal workspace.
      // Ordinary tests must never read or mutate it through the new endpoints.
      // Tests needing a real workspace create a separate context/backend.
      await page.route("**/api/agent/workspace/**", (route) => {
        const request = route.request();
        if (request.method() !== "GET")
          return route.fulfill({
            status: 409,
            json: {
              error: "This ordinary browser fixture has no approved workspace.",
            },
          });
        const id = decodeURIComponent(
          new URL(request.url()).pathname.split("/").at(-1)!,
        );
        return route.fulfill({
          json:
            id === "status"
              ? { backend: "json", ready: true }
              : id === "model-profiles"
                ? {
                    profiles: [],
                    plannerProfileId: "default",
                    priority: "balanced",
                    revision: "fixture",
                  }
                : id === "dashboard"
                  ? {
                      notebookId: "fixture",
                      since: Date.now() - 30 * 86400000,
                      until: Date.now(),
                      generatedAt: Date.now(),
                      persistence: "degraded",
                      truncated: false,
                      traces: [],
                    }
                  : id === "traces"
                    ? { traces: [], persistence: "degraded" }
                    : id === "metrics"
                      ? {
                          since: 0,
                          totalRuns: 0,
                          completedRuns: 0,
                          failedRuns: 0,
                          interruptedRuns: 0,
                          completionRate: null,
                          failureRate: null,
                          interruptionRate: null,
                          latencyMs: { p50: null, p95: null },
                          modelCalls: 0,
                          toolCalls: 0,
                          promptTokens: null,
                          completionTokens: null,
                          citationChecks: 0,
                          citationChecksPassed: 0,
                          citationChecksFailed: 0,
                          persistence: "degraded",
                        }
                      : emptyWorkspace(id),
        });
      });
      await page.route("**/api/prompt/rewrite", (route) =>
        route.fulfill({
          json: { prompt: route.request().postDataJSON().question },
        }),
      );
    }
    await use(page);
  },
});
export { expect };
