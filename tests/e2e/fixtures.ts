import { test as base, expect } from "@playwright/test";
/** Every ordinary browser scenario mocks prompt rewriting. It must never use
 * a developer's provider credential just because their local server is running. */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (!/^live |real Nemotron/i.test(testInfo.title))
      await page.route("**/api/prompt/rewrite", (route) =>
        route.fulfill({
          json: { prompt: route.request().postDataJSON().question },
        }),
      );
    await use(page);
  },
});
export { expect };
