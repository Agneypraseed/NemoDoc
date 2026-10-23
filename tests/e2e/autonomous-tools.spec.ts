import { test, expect } from "@playwright/test";
import express from "express";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { createApp } from "../../server/app.ts";
import { SettingsStore } from "../../server/settings.ts";
import { citationIssues, citationReferences } from "../../src/lib/citations.ts";
import type { AgentRun } from "../../src/agent-types.ts";

const publicURL = "https://93.184.216.34/tool-guide";
for (const live of [false, true]) {
  test(`${live ? "real Nemotron" : "fixture"} autonomous tools read approved files, research public pages and create audited output`, async ({
    browser,
  }, testInfo) => {
    test.skip(
      live && process.env.NEMODOC_AUTONOMOUS_LIVE !== "1",
      "Explicit opt-in required for live inference/search charges.",
    );
    test.setTimeout(360000);
    mkdirSync("output", { recursive: true });
    const directory = mkdtempSync(
      path.resolve(`output/autonomous-${live ? "live" : "fixture"}-`),
    );
    const env = live && existsSync(".env") ? parse(readFileSync(".env")) : {};
    const liveSecrets =
      live && existsSync("data/autonomous-live.env")
        ? parse(readFileSync("data/autonomous-live.env"))
        : {};
    const settings = new SettingsStore(
      {
        apiKey: live
          ? env.NEBIUS_API_KEY || env.NVIDIA_API_KEY || ""
          : "fixture-key",
        baseUrl:
          live && env.NEBIUS_API_KEY
            ? env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1"
            : "https://integrate.api.nvidia.com/v1",
        model:
          live && env.NEBIUS_API_KEY
            ? env.NEBIUS_MODEL || "nvidia/Nemotron-3_5-Lightning"
            : live
              ? env.NVIDIA_MODEL || "nvidia/nemotron-3-nano-30b-a3b"
              : "nvidia/test-nemotron",
      },
      live && existsSync("data/settings.json")
        ? "data/settings.json"
        : undefined,
    );
    expect(
      settings.value.apiKey,
      "A configured Nemotron connection is required.",
    ).toBeTruthy();
    expect(settings.value.model).toMatch(/nemotron/i);
    let modelCalls = 0,
      webCalls = 0;
    const requests: {
      model: string;
      status: number;
      responseId?: string;
      returnedModel?: string;
    }[] = [];
    const withWeb = !live || !!liveSecrets.TAVILY_API_KEY;
    expect(
      withWeb,
      "Save TAVILY_API_KEY in ignored data/autonomous-live.env for the live web journey.",
    ).toBe(true);
    const fetcher: typeof fetch = async (target, init) => {
      if (live) {
        const result = await fetch(target, init);
        if (String(target).endsWith("/chat/completions")) {
          modelCalls++;
          const body = await result
            .clone()
            .json()
            .catch(() => ({}));
          requests.push({
            model: settings.value.model,
            status: result.status,
            responseId: body.id,
            returnedModel: body.model,
          });
        } else webCalls++;
        return result;
      }
      if (String(target).endsWith("/search")) {
        webCalls++;
        return Response.json({
          results: [
            { url: publicURL, title: "Public tool documentation (fixture)" },
          ],
        });
      }
      if (String(target).endsWith("/extract")) {
        webCalls++;
        return Response.json({
          results: [
            {
              url: publicURL,
              raw_content:
                "Tool calling returns structured results. Applications validate arguments and enforce permissions before executing tools.",
            },
          ],
        });
      }
      modelCalls++;
      const body = JSON.parse(String(init?.body));
      expect(body.tool_choice).toBe("auto");
      const task = app.locals.agent.data.state.tasks[0];
      const call = (name: string, args: unknown) => ({
        content: null,
        tool_calls: [
          {
            id: randomUUID(),
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
      const messages = [
        call("read_file", { fileId: task.fileIds[0] }),
        call("search_web", {
          query: "NVIDIA Nemotron tool calling input validation",
        }),
        call("read_web", { url: publicURL }),
        call("write_file", {
          name: "../outside.md",
          content: "Rejected path",
          citationIds: [1],
        }),
        call("write_file", {
          name: "nemotron-tool-brief.md",
          content:
            "# Nemotron tool workflow\n\nThe approved brief asks for an explanation of tool selection and safeguards. [1]\n\nTools return structured results, and applications enforce permissions and validate arguments before executing them. [2]",
          citationIds: [1, 2],
        }),
        {
          content:
            "Read the approved brief and public documentation, then created **nemotron-tool-brief.md** with supporting citations. The unsafe parent-directory filename was rejected before writing. [1, 2]",
        },
      ];
      return Response.json({
        id: "fixture-response",
        model: settings.value.model,
        choices: [{ message: messages[modelCalls - 1] }],
      });
    };
    const app = createApp(settings.value, fetcher, {
      agentFile: path.join(directory, "private", "agent.json"),
      workspaceFile: path.join(directory, "private", "workspace.json"),
      traceSpoolFile: path.join(directory, "trace.jsonl"),
    });
    await app.locals.workspace.ready;
    app.use(express.static(path.resolve("dist")));
    app.get("/{*splat}", (_req, res) =>
      res.sendFile(path.resolve("dist/index.html")),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = async (endpoint: string, body: unknown) => {
      const result = await fetch(api + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(result.ok, `Setup failed: ${endpoint}`).toBe(true);
      return result.json();
    };
    const context = await browser.newContext({
      viewport: { width: 1500, height: 1120 },
      acceptDownloads: true,
      recordVideo: {
        dir: path.join(directory, "video"),
        size: { width: 1500, height: 1120 },
      },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      if (withWeb) {
        await post("/api/agent/workspace/web-connection", {
          provider: "tavily",
          apiKey: live ? liveSecrets.TAVILY_API_KEY : "fixture-search-key",
        });
        await post("/api/agent/workspace/web-connection/test", {});
      }
      await page.goto(api + "/app");
      console.log("Autonomous journey: frontend loaded");
      await expect(page).toHaveTitle(/NemoDoc/);
      await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
      console.log("Autonomous journey: sample PDF ready");
      await page.getByRole("button", { name: "Agent", exact: true }).click();
      await page
        .getByRole("button", {
          name: "Expand Agent to full screen",
          exact: true,
        })
        .click();
      await page
        .getByText("Scheduled tasks & activity inbox", { exact: true })
        .click();
      await page.getByRole("button", { name: "New task", exact: true }).click();
      console.log("Autonomous journey: task form ready");
      await page
        .getByLabel("Task name", { exact: true })
        .fill(
          live
            ? "Live Nemotron · research and write"
            : "Web and file tools · security fixture",
        );
      await page
        .getByRole("combobox", { name: "Reusable skill", exact: true })
        .selectOption("autonomous-tools");
      await page.getByLabel("Add a text file", { exact: true }).setInputFiles({
        name: "research-brief.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "PUBLIC SYNTHETIC BRIEF FOR SOFTWARE VERIFICATION.\nExplain how a Nemotron agent chooses tools and why applications must validate tool inputs, restrict file access and audit actions. This brief is a task outline, not factual evidence about a particular model. Never use personal files.",
        ),
      });
      await expect(
        page.getByLabel("research-brief.md · uploaded file"),
      ).toBeChecked();
      await page
        .getByLabel("Allow new output files in this notebook’s agent workspace")
        .check();
      if (withWeb)
        await page
          .getByLabel("Allow public web search and page reading")
          .check();
      await page
        .getByLabel("What should I do?", { exact: true })
        .fill(
          withWeb
            ? "Read my selected research-brief.md. Find official NVIDIA documentation about Nemotron tool/function calling on the public web, read one relevant returned page, and write nemotron-tool-brief.md: an explanation under 250 words grounded in the brief and extracted page. Put numeric citations after factual sentences and include the source URL. Clearly label application safeguards as recommendations unless the source supports them. Final answer: two sentences with the file name and cited sources; the action history already lists the actions. Choose the tools and order yourself. Do not create study cards, change memory or schedule a review."
            : "Read my selected research-brief.md and write nemotron-tool-brief.md as a practical checklist for the requested software verification. Use only the approved file; no web provider is configured. Cite the brief and distinguish its requested checks from unverified claims about any specific model. Choose the needed tools yourself. Do not create study cards, change memory or schedule a review.",
        );
      await page.getByRole("button", { name: "Run task", exact: true }).click();
      await expect
        .poll(() => app.locals.agent.data.state.runs[0]?.status, {
          timeout: 200000,
        })
        .toMatch(/completed|failed|cancelled/);
      const run: AgentRun = app.locals.agent.data.state.runs[0];
      writeFileSync(
        path.join(directory, "run.json"),
        JSON.stringify(run, null, 2),
      );
      expect(run.status, run.error).toBe("completed");
      expect(
        run.steps.some(
          (s) => s.tool === "read_file" && s.status === "succeeded",
        ),
      ).toBe(true);
      expect(
        run.steps.some(
          (s) => s.tool === "write_file" && s.status === "succeeded",
        ),
      ).toBe(true);
      if (withWeb)
        for (const name of ["search_web", "read_web"])
          expect(
            run.steps.some((s) => s.tool === name && s.status === "succeeded"),
          ).toBe(true);
      expect(run.files).toHaveLength(1);
      expect(citationIssues(run.answer, run.citations)).toEqual([]);
      expect(
        citationReferences(run.answer, run.citations).length,
      ).toBeGreaterThan(0);
      const output = app.locals.agent.files.read(
        run.notebookId,
        run.files![0].id,
      );
      expect(output.content.length).toBeGreaterThan(100);
      expect(citationIssues(output.content, run.citations)).toEqual([]);
      for (const id of run.files![0].citationIds ?? [])
        expect(citationReferences(output.content, run.citations)).toContain(id);
      expect(
        app.locals.agent.files.read(run.notebookId, run.toolAccess!.fileIds[0])
          .content,
      ).toMatch(/PUBLIC SYNTHETIC BRIEF/);
      const result = page.locator("article.agent-result").filter({
        has: page.getByRole("heading", { name: run.title, exact: true }),
      });
      await expect(result.locator(".agent-status.completed")).toBeVisible({
        timeout: 12000,
      });
      await expect(result.locator(".markdown")).toContainText(
        "nemotron-tool-brief.md",
      );
      await expect(
        result.getByRole("link", { name: /nemotron-tool-brief.md/ }),
      ).toBeVisible({ timeout: 12000 });
      await result
        .getByText(`Action history (${run.steps.length})`, { exact: true })
        .click();
      await expect(result.locator(".agent-steps")).toContainText("Succeeded");
      if (!live)
        await expect(result.locator(".agent-steps")).toContainText("Rejected");
      const downloadPromise = page.waitForEvent("download");
      await result
        .getByRole("link", { name: /nemotron-tool-brief.md/ })
        .click();
      const download = await downloadPromise;
      await download.saveAs(path.join(directory, "nemotron-tool-brief.md"));
      expect(
        readFileSync(path.join(directory, "nemotron-tool-brief.md"), "utf8"),
      ).toBe(output.content);
      const events = (
        await app.locals.traceStore.events(run.notebookId, run.id, 0, 1000)
      ).events;
      expect(events.filter((e: any) => e.type === "tool.result").length).toBe(
        run.steps.length,
      );
      expect(events.some((e: any) => e.type === "security.validation")).toBe(
        true,
      );
      if (!live)
        expect(events.some((e: any) => e.type === "security.rejected")).toBe(
          true,
        );
      writeFileSync(
        path.join(directory, "summary.json"),
        JSON.stringify(
          {
            mode: live ? "live Nemotron" : "deterministic fixture",
            withWeb,
            model: settings.value.model,
            provider: settings.value.baseUrl,
            modelCalls,
            webCalls,
            requests,
            status: run.status,
            steps: run.steps,
            output: run.files,
            eventCount: events.length,
          },
          null,
          2,
        ),
      );
      await result.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(directory, "workflow.png"),
        fullPage: true,
      });
      await result.screenshot({
        path: path.join(directory, "workflow-detail.png"),
      });
      await page.reload();
      await page.getByRole("button", { name: "Agent", exact: true }).click();
      await page
        .getByText("Scheduled tasks & activity inbox", { exact: true })
        .click();
      await expect(
        page.getByRole("link", { name: /nemotron-tool-brief.md/ }),
      ).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: path.join(directory, "mobile.png"),
        fullPage: true,
      });
      expect(errors).toEqual([]);
      if (live) {
        expect(requests.length).toBeGreaterThan(1);
        expect(requests.every((r) => r.status === 200 && !!r.responseId)).toBe(
          true,
        );
      }
      console.log(
        `Autonomous ${live ? "live" : "fixture"} evidence: ${directory}`,
      );
    } finally {
      await context.close();
      app.locals.agent.stop();
      app.locals.workspace.worker.stop();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await app.locals.traceStore.close();
      await app.locals.workspace.repository.close();
    }
  });
}
