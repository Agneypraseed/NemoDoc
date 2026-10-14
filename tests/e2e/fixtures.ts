import { test as base, expect } from "@playwright/test";
import { emptyWorkspace } from "../../src/workspace-types";
/** Every ordinary browser scenario mocks prompt rewriting. It must never use
 * a developer's provider credential just because their local server is running. */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (!/^live |real Nemotron/i.test(testInfo.title)) {
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
