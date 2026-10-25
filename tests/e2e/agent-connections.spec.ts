import { test, expect } from "./fixtures";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/app.ts";

test("open model reads approved notebook notes and previews email before delivering", async ({
  page,
  context,
}) => {
  let sends = 0;
  let smtpVerifyFails = false;
  const app = createApp(
    {
      apiKey: "fixture-key",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/test-nemotron",
    },
    (async (url, init) => {
      const body = JSON.parse(String(init?.body));
      const results = body.messages.filter((m: any) => m.role === "tool");
      let message;
      const call = (name: string, args: unknown) => ({
        content: null,
        tool_calls: [
          {
            id: "call-" + name,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
      if (body.messages[0]?.content?.includes("connection_probe"))
        message = results.length
          ? { content: JSON.parse(results[0].content).receipt }
          : call("connection_probe", { ok: true });
      else if (!results.length)
        message = call("search_sources", { query: "spaced practice" });
      else if (results.length === 1)
        message = call("save_study_material", {
          kind: "guide",
          title: "Note guide",
          content: "Study spaced practice. [1]",
          items: [],
        });
      else message = { content: "Study spaced practice from your notes. [1]" };
      return Response.json({ choices: [{ message }] });
    }) as typeof fetch,
    {
      smtpTransportFactory: () => ({
        verify: async () => {
          if (smtpVerifyFails) throw new Error("Authentication failed");
          return true;
        },
        sendMail: async (message) => {
          sends++;
          return {
            messageId: "smtp-fixture",
            accepted: [message.to],
            rejected: [],
          };
        },
        close() {},
      }),
    },
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await context.route("**/api/agent**", async (route) => {
    const request = route.request();
    const response = await fetch(apiUrl + new URL(request.url()).pathname, {
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
    await page.goto("/app");
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await page.getByRole("button", { name: "Notebook", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Notebook notes", exact: true })
      .fill("Spaced practice helps me remember. Review recall on Friday.");
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await expect(
      page
        .getByRole("form", { name: "Agent model connection", exact: true })
        .getByText("nvidia/test-nemotron", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Model connection", { exact: true })
      .selectOption("custom");
    await page
      .getByRole("button", { name: "Use local Gemma 4 / Ollama", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save model connection", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Test saved model", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "completed a tool-call and result round trip" }),
    ).toContainText("completed a tool-call and result round trip");
    await page
      .getByLabel("SMTP host", { exact: true })
      .fill("smtp.example.com");
    await page
      .getByLabel("SMTP username", { exact: true })
      .fill("sender@example.com");
    await page
      .getByLabel("Sender email address", { exact: true })
      .fill("sender@example.com");
    await page
      .getByRole("button", { name: "Use Gmail SMTP settings", exact: true })
      .click();
    await expect(page.getByLabel("SMTP host", { exact: true })).toHaveValue(
      "smtp.gmail.com",
    );
    await expect(page.getByLabel("SMTP username", { exact: true })).toHaveValue(
      "sender@example.com",
    );
    await page
      .getByRole("button", { name: "Undo Gmail preset", exact: true })
      .click();
    await expect(page.getByLabel("SMTP host", { exact: true })).toHaveValue(
      "smtp.example.com",
    );
    await page
      .getByLabel("Email recipient", { exact: true })
      .fill("owner@example.com");
    await page
      .getByLabel("SMTP password / app password", { exact: true })
      .fill("email-fixture-key");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(
      page.getByLabel("SMTP password / app password", { exact: true }),
    ).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(
      page.getByLabel("SMTP password / app password", { exact: true }),
    ).toHaveAttribute("type", "password");
    await page
      .getByRole("button", { name: "Save email connection", exact: true })
      .click();
    await expect(
      page.getByLabel("SMTP password / app password", { exact: true }),
    ).toHaveValue("");
    await page.getByRole("button", { name: "Reveal saved password" }).click();
    await expect(
      page.getByLabel("SMTP password / app password", { exact: true }),
    ).toHaveValue("email-fixture-key");
    await expect(
      page.getByLabel("SMTP password / app password", { exact: true }),
    ).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(
      page.getByLabel("SMTP password / app password", { exact: true }),
    ).toHaveAttribute("type", "password");
    smtpVerifyFails = true;
    await page
      .getByRole("button", { name: "Test saved SMTP connection", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Connection failed:");
    smtpVerifyFails = false;
    await page
      .getByRole("button", { name: "Test saved SMTP connection", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "SMTP connection verified" }),
    ).toContainText("SMTP connection verified.");
    expect(sends).toBe(0);
    await page.locator(".agent-panel").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      path: "test-results/agent-connections-desktop.png",
      fullPage: true,
    });
    await page.locator(".agent-more-nav > summary").click();
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    await page
      .getByLabel("Notebook notes, saved answers and annotations")
      .check();
    await page.getByLabel("Store the selected extracted text").check();
    await page
      .getByRole("button", { name: "Save source permissions", exact: true })
      .click();
    await expect(page.locator(".agent-source-cache")).toContainText(
      "Notebook notes",
    );
    await page.getByRole("button", { name: "Research", exact: true }).click();
    await page
      .getByText("Scheduled tasks & activity inbox", { exact: true })
      .click();
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page
      .getByLabel("Task name", { exact: true })
      .fill("My note briefing");
    await page
      .getByLabel("What should I do?", { exact: true })
      .fill("Summarize my spaced practice notes in one sentence.");
    await page.getByRole("button", { name: "Run task", exact: true }).click();
    await expect.poll(() => app.locals.agent.data.state.tasks.length).toBe(1);
    await app.locals.agent.tick(Date.now());
    await expect(page.locator("article.agent-result")).toContainText(
      "Study spaced practice from your notes.",
    );
    await expect(page.locator("article.agent-result")).toContainText(
      "gemma4:e4b",
    );
    await page
      .getByRole("button", { name: "Preview email", exact: true })
      .click();
    await expect(page.locator(".agent-delivery pre")).toContainText(
      "Study spaced practice",
    );
    expect(sends).toBe(0);
    await page
      .getByRole("button", { name: "Send to owner@example.com", exact: true })
      .click();
    await expect(page.locator(".agent-delivery")).toContainText(
      "Provider accepted the message",
    );
    expect(sends).toBe(1);
    await page.getByText("Note guide · guide", { exact: true }).click();
    await page
      .getByRole("button", { name: "Save to Studio", exact: true })
      .click();
    await page.getByRole("button", { name: "Studio", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Saved study material", exact: true })
      .selectOption({ label: "Note guide · guide" });
    await page
      .locator(".study-guide")
      .getByRole("button", { name: "1", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Notebook notes · section 1" }),
    ).toContainText("Spaced practice helps me remember");
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await page
      .getByLabel("Model connection", { exact: true })
      .selectOption("notebook");
    await page
      .getByRole("button", { name: "Save model connection", exact: true })
      .click();
    await expect(
      page
        .getByRole("form", { name: "Agent model connection", exact: true })
        .getByText("nvidia/test-nemotron", {
          exact: true,
        }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Research", exact: true }).click();
    await page
      .getByText("Scheduled tasks & activity inbox", { exact: true })
      .click();
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page
      .getByLabel("Task name", { exact: true })
      .fill("Weekday NVIDIA revision");
    await page
      .getByLabel("What should I do?", { exact: true })
      .fill("Read my selected notes and create a short revision summary.");
    await page.getByLabel("Repeat", { exact: true }).selectOption("weekdays");
    await expect(
      page.getByLabel("Weekday delivery time", { exact: true }),
    ).toHaveValue("08:00");
    await expect(
      page.getByLabel("Schedule time zone", { exact: true }),
    ).toHaveValue("Europe/Berlin");
    await page
      .getByLabel("Email to owner@example.com", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Schedule task", exact: true })
      .click();
    await expect.poll(() => app.locals.agent.data.state.tasks.length).toBe(2);
    const scheduled = app.locals.agent.data.state.tasks[1];
    expect(scheduled.connection.model).toBe("nvidia/test-nemotron");
    await app.locals.agent.tick(scheduled.dueAt);
    expect(app.locals.agent.data.state.runs[0].deliveries[0].status).toBe(
      "accepted",
    );
    expect(sends).toBe(2);
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Clear password", exact: true })
      .click();
    await expect(
      page.getByLabel("SMTP password / app password", { exact: true }),
    ).toHaveValue("");
    await expect(page.getByText("Saved SMTP password cleared.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Clear password", exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page
          .locator(".sidebar")
          .evaluate((el) => Math.round(el.getBoundingClientRect().right)),
      )
      .toBe(0);
    await page.screenshot({
      path: "test-results/agent-connections-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    app.locals.agent.stop();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
