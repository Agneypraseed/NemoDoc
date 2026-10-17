import { test, expect } from "./fixtures";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/app.ts";

test("OpenClaw connection saves a masked gateway token and verifies both tool turns", async ({
  page,
}) => {
  const requests: any[] = [];
  const app = createApp(
    {
      apiKey: "notebook-fixture",
      baseUrl: "https://api.tokenfactory.nebius.com/v1",
      model: "nvidia/test-nemotron",
    },
    (async (url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      assert.equal(String(url), "http://127.0.0.1:18789/v1/chat/completions");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer gateway-fixture",
      );
      assert.equal(body.model, "openclaw/nemodoc");
      const result = body.messages.find((m: any) => m.role === "tool");
      const message = result
        ? { content: JSON.parse(result.content).receipt }
        : {
            content: null,
            tool_calls: [
              {
                id: "probe-browser",
                type: "function",
                function: {
                  name: "connection_probe",
                  arguments: '{"ok":true}',
                },
              },
            ],
          };
      return Response.json({ choices: [{ message }] });
    }) as typeof fetch,
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await page.route("**/api/agent**", async (route) => {
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
    await page.goto("/");
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await page.getByLabel("Model connection").selectOption("openclaw");
    await expect(
      page.getByLabel("OpenClaw gateway base URL", { exact: true }),
    ).toHaveValue("http://127.0.0.1:18789/v1");
    await expect(
      page.getByLabel("OpenClaw agent target", { exact: true }),
    ).toHaveValue("openclaw/nemodoc");
    const token = page.getByLabel("OpenClaw gateway token", { exact: true });
    await expect(token).toHaveAttribute("type", "password");
    await token.fill("gateway-fixture");
    await page
      .getByRole("button", { name: "Save model connection", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Connection saved");
    await expect(token).toHaveValue("");
    await page
      .getByRole("button", { name: "Test gateway tool support", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Gateway tool-call and result round trip passed",
    );
    expect(requests).toHaveLength(2);
    expect(requests[1].messages.at(-1).tool_call_id).toBe("probe-browser");
    await page.reload();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await expect(page.getByLabel("Model connection")).toHaveValue("openclaw");
    await expect(token).toHaveValue("");
    await expect(
      page.getByText("The saved connection has passed its tool-call test.", {
        exact: false,
      }),
    ).toBeVisible();
    await page.getByLabel("Model connection").selectOption("custom");
    await page
      .getByRole("button", { name: "Save model connection", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Connection saved");
    const connection = await fetch(apiUrl + "/api/agent/connections").then(
      (r) => r.json(),
    );
    expect(connection.model.hasApiKey).toBe(false);
    expect(connection.model.tested).toBe(false);
  } finally {
    app.locals.agent.stop();
    await app.locals.workspace.ready;
    await app.locals.workspace.repository.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
