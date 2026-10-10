import type { Page } from "@playwright/test";

export async function openReaderTools(page: Page, index = 0) {
  const trigger = page
    .getByRole("button", { name: "Reader tools", exact: true })
    .nth(index);
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
}
