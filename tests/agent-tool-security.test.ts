import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  linkSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { AgentStore } from "../server/agent-store.ts";
import { AgentFiles } from "../server/agent-files.ts";
import { AgentWorker } from "../server/agent.ts";
import { TraceStore } from "../server/trace-store.ts";
import { SettingsStore } from "../server/settings.ts";
import { WebResearch } from "../server/workspace/web-research.ts";
import { taskInput } from "../src/agent-types.ts";
import { createApp } from "../server/app.ts";
import type { AddressInfo } from "node:net";

const config = {
  apiKey: "private-nemotron-test-key",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  model: "nvidia/test-nemotron",
};
const url = "https://93.184.216.34/official-guide";
const tool = (name: string, args: unknown) => ({
  content: null,
  tool_calls: [
    {
      id: randomUUID(),
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});
const response = (message: unknown) =>
  Response.json({ id: "fixture", model: config.model, choices: [{ message }] });
function task(fileIds: string[], extra = {}) {
  return {
    ...taskInput.parse({
      notebookId: "tools",
      sourceIds: [],
      fileIds,
      title: "Research brief",
      prompt: "Read the brief, research it and write a cited file.",
      skillId: "autonomous-tools",
      dueAt: 100,
      ...extra,
    }),
    id: "task",
    status: "active" as const,
    createdAt: 1,
    connection: { baseUrl: config.baseUrl, model: config.model },
  };
}

test("file sandbox uses opaque IDs, preserves originals on writes, survives reload, and rejects paths, oversized UTF-8 and cross-notebook reads", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-file-security-"));
  try {
    const filename = path.join(directory, "agent.json");
    const data = new AgentStore(filename),
      files = new AgentFiles(data, filename + ".files");
    for (const name of [
      "../secret.md",
      "..\\secret.txt",
      "C:\\private.txt",
      ".env",
      "CON.txt",
      "folder/file.md",
      "result.html",
      "file\u0000.txt",
    ])
      assert.throws(() =>
        files.create({ notebookId: "tools", name, content: "blocked" }),
      );
    assert.throws(
      () =>
        files.create({
          notebookId: "tools",
          name: "large.md",
          content: "é".repeat(40000),
        }),
      /64 KiB/,
    );
    const input = files.create({
      notebookId: "tools",
      name: "brief.md",
      content: "Approved brief.",
    });
    const output = files.create(
      { notebookId: "tools", name: "brief.md", content: "New content." },
      { runId: "run", citationIds: [1] },
    );
    assert.notEqual(input.id, output.id);
    assert.equal(files.read("tools", input.id).content, "Approved brief.");
    assert.throws(() => files.read("other-notebook", input.id), /outside/);
    assert.throws(() => files.read("tools", "../../.env"), /Invalid file ID/);
    data.state.runs.push({
      id: "run",
      taskId: "task",
      notebookId: "tools",
      title: "Interrupted output",
      status: "running",
      startedAt: 1,
      answer: "",
      connection: { baseUrl: config.baseUrl, model: config.model },
      steps: [],
      citations: [],
      materials: [],
      sent: { memoryIds: [], sourceIds: [], skill: "", prompt: "" },
      calls: 1,
    });
    data.flush();
    const reloaded = new AgentStore(filename);
    assert.equal(reloaded.state.runs[0].status, "interrupted");
    assert.equal(reloaded.state.runs[0].files?.[0].id, output.id);
    const restored = new AgentFiles(reloaded, filename + ".files");
    assert.equal(restored.read("tools", output.id).content, "New content.");
    const folder = path.join(
      filename + ".files",
      createHash("sha256").update("tools").digest("hex"),
    );
    const privateLink = path.join(directory, "external-hard-link.txt");
    linkSync(path.join(folder, input.id + ".txt"), privateLink);
    assert.throws(() => restored.read("tools", input.id), /regular workspace/);
    assert.equal(readFileSync(privateLink, "utf8"), "Approved brief.");
    assert.equal(readdirSync(folder).length, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy agent data gains the tool skill once and preserves later edits and deletion", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-tool-migration-"));
  try {
    const filename = path.join(directory, "agent.json");
    const legacy = new AgentStore(filename);
    delete legacy.state.autonomousToolsVersion;
    legacy.state.skills = legacy.state.skills.filter(
      (s) => s.id !== "autonomous-tools",
    );
    legacy.state.plans = [
      { notebookId: "tools", text: "Preserve this plan", updatedAt: 1 },
    ];
    legacy.flush();
    const migrated = new AgentStore(filename);
    assert.equal(
      migrated.state.skills.filter((s) => s.id === "autonomous-tools").length,
      1,
    );
    assert.equal(migrated.state.plans[0].text, "Preserve this plan");
    migrated.state.skills.find(
      (s) => s.id === "autonomous-tools",
    )!.instructions = "My edited instructions";
    migrated.flush();
    const edited = new AgentStore(filename);
    assert.equal(
      edited.state.skills.find((s) => s.id === "autonomous-tools")
        ?.instructions,
      "My edited instructions",
    );
    edited.state.skills = edited.state.skills.filter(
      (s) => s.id !== "autonomous-tools",
    );
    edited.flush();
    assert.equal(
      new AgentStore(filename).state.skills.some(
        (s) => s.id === "autonomous-tools",
      ),
      false,
    );
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("file sandbox refuses notebook directory junctions/symlinks", (t) => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "nemodoc-linked-workspace-"),
  );
  try {
    const root = path.join(directory, "files"),
      outside = path.join(directory, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    const hash = createHash("sha256").update("tools").digest("hex");
    try {
      symlinkSync(
        outside,
        path.join(root, hash),
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        t.skip("OS denies creating a test symlink.");
        return;
      }
      throw error;
    }
    const files = new AgentFiles(new AgentStore(), root);
    assert.throws(
      () =>
        files.create({
          notebookId: "tools",
          name: "out.md",
          content: "blocked",
        }),
      /inside/,
    );
    assert.deepEqual(readdirSync(outside), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("autonomous model calls read selected files, search/read web, create actual cited files and persist redacted audit outcomes", async (t) => {
  t.mock.method(console, "info", () => {});
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-autonomous-"));
  try {
    const data = new AgentStore(path.join(directory, "agent.json"));
    const files = new AgentFiles(data, path.join(directory, "files"));
    const input = files.create({
      notebookId: "tools",
      name: "brief.md",
      content: "Compare local notes with public documentation.",
    });
    const privateFile = files.create({
      notebookId: "other",
      name: "private.md",
      content: "PRIVATE_OTHER_NOTEBOOK",
    });
    let models = 0,
      searches = 0,
      extracts = 0;
    const fetcher = (async (target, init) => {
      const body = JSON.parse(String(init?.body));
      if (String(target).endsWith("/search")) {
        searches++;
        return Response.json({
          results: [{ url, title: "Public official guide" }],
        });
      }
      if (String(target).endsWith("/extract")) {
        extracts++;
        return Response.json({
          results: [
            {
              url,
              raw_content:
                "Public documentation states that tools return observable results.",
            },
          ],
        });
      }
      models++;
      assert.equal(body.tool_choice, "auto");
      assert.ok(body.tools.some((s: any) => s.function.name === "write_file"));
      assert.doesNotMatch(
        JSON.stringify(body),
        /PRIVATE_OTHER_NOTEBOOK|private-nemotron-test-key/,
      );
      const messages = [
        tool("read_file", { fileId: privateFile.id }),
        tool("write_file", {
          name: "../escape.md",
          content: "blocked",
          citationIds: [1],
        }),
        tool("read_file", { fileId: input.id }),
        tool("search_web", { query: "observable tool results" }),
        tool("read_web", { url }),
        tool("write_file", {
          name: "research-brief.md",
          content:
            "The local brief requests a comparison [1]. Public tools return observable results [2].",
          citationIds: [1, 2],
        }),
        {
          content:
            "Created the brief using the approved file and extracted public page. [1, 2]",
        },
      ];
      return response(messages[models - 1]);
    }) as typeof fetch;
    const web = new WebResearch(undefined, fetcher);
    web.save({ apiKey: "private-web-test-key" });
    web.value.tested = true;
    const traceFile = path.join(directory, "trace.jsonl");
    const traces = new TraceStore(undefined, traceFile, () => [
      config.apiKey,
      web.value.apiKey,
    ]);
    const queued = task([input.id], {
      allowWeb: true,
      allowFileWrites: true,
      webRevision: web.value.revision,
    });
    data.state.tasks.push(queued);
    const worker = new AgentWorker(
      data,
      new SettingsStore(config),
      fetcher,
      undefined,
      traces,
      web,
      files,
    );
    await worker.tick(100);
    const run = data.state.runs[0];
    assert.equal(run.status, "completed", run.error);
    assert.equal(models, 7);
    assert.equal(searches, 1);
    assert.equal(extracts, 1);
    assert.deepEqual(
      run.steps.map((s) => s.status),
      [
        "rejected",
        "rejected",
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
      ],
    );
    assert.equal(run.files?.length, 1);
    assert.match(
      files.read("tools", run.files![0].id).content,
      /observable results \[2\]/,
    );
    assert.equal(
      files.read("tools", input.id).content,
      "Compare local notes with public documentation.",
    );
    assert.deepEqual(
      run.citations.map((c) => c.kind),
      ["file", "web"],
    );
    assert.equal(run.citations[1].url, url);
    const events = (await traces.events("tools", run.id, 0, 1000)).events;
    assert.equal(events.filter((e) => e.type === "tool.call").length, 6);
    assert.equal(
      events.filter((e) => e.type === "security.rejected").length,
      2,
    );
    assert.equal(
      events.filter((e) => e.type === "security.validation").length,
      4,
    );
    assert.equal(events.filter((e) => e.type === "tool.result").length, 6);
    assert.doesNotMatch(
      readFileSync(traceFile, "utf8"),
      /private-nemotron-test-key|private-web-test-key|PRIVATE_OTHER_NOTEBOOK/,
    );
    const restored = new TraceStore(undefined, traceFile);
    assert.equal((await restored.detail("tools", run.id))?.status, "completed");
    await traces.close();
    await restored.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ungranted web/write tools, unknown tools and extra arguments cannot execute", async () => {
  const data = new AgentStore(),
    files = new AgentFiles(data);
  const input = files.create({
    notebookId: "tools",
    name: "brief.txt",
    content: "Only this file is approved.",
  });
  let n = 0;
  const fetcher = (async (target, init) => {
    assert.match(String(target), /chat\/completions$/);
    const body = JSON.parse(String(init?.body));
    assert.ok(
      !body.tools.some((s: any) =>
        ["search_web", "write_file"].includes(s.function.name),
      ),
    );
    const messages = [
      tool("search_web", { query: "blocked" }),
      tool("write_file", {
        name: "out.md",
        content: "blocked",
        citationIds: [1],
      }),
      tool("exec", { command: "blocked" }),
      tool("read_file", { fileId: input.id, path: ".env" }),
    ];
    return response(messages[n++ % messages.length]);
  }) as typeof fetch;
  data.state.tasks.push(task([input.id]));
  await new AgentWorker(
    data,
    new SettingsStore(config),
    fetcher,
    undefined,
    undefined,
    undefined,
    files,
  ).tick(100);
  assert.equal(n, 8);
  assert.equal(data.state.runs[0].status, "failed");
  assert.ok(data.state.runs[0].steps.every((s) => s.status === "rejected"));
  assert.equal(files.list("tools").length, 1);
  assert.equal(data.state.runs[0].citations.length, 0);
});

test("search candidates alone cannot support citations or a generated file", async () => {
  const data = new AgentStore();
  let models = 0;
  const fetcher = (async (target) => {
    if (String(target).endsWith("/search"))
      return Response.json({ results: [{ url, title: "Unread candidate" }] });
    return response(
      ++models === 1
        ? tool("search_web", { query: "public tools" })
        : models === 2
          ? tool("write_file", {
              name: "unsupported.md",
              content: "Unverified claim [1]",
              citationIds: [1],
            })
          : { content: "Unverified claim [1]" },
    );
  }) as typeof fetch;
  const web = new WebResearch(undefined, fetcher);
  web.save({ apiKey: "fixture-key" });
  web.value.tested = true;
  data.state.tasks.push(
    task([], {
      allowWeb: true,
      allowFileWrites: true,
      webRevision: web.value.revision,
    }),
  );
  await new AgentWorker(
    data,
    new SettingsStore(config),
    fetcher,
    undefined,
    undefined,
    web,
  ).tick(100);
  const run = data.state.runs[0];
  assert.equal(run.status, "failed");
  assert.equal(run.citations.length, 0);
  assert.equal(run.files?.length, 0);
  assert.equal(run.steps[1].status, "rejected");
  assert.match(run.steps[1].summary, /actually retrieved/);
});

test("the denied 21st action is audited and never executes", async () => {
  const data = new AgentStore(),
    files = new AgentFiles(data);
  const input = files.create({
    notebookId: "tools",
    name: "brief.txt",
    content: "Approved.",
  });
  let models = 0;
  const fetcher = (async () => {
    models++;
    return response({
      content: null,
      tool_calls: Array.from(
        { length: 6 },
        () => tool("list_files", {}).tool_calls[0],
      ),
    });
  }) as typeof fetch;
  data.state.tasks.push(task([input.id]));
  await new AgentWorker(
    data,
    new SettingsStore(config),
    fetcher,
    undefined,
    undefined,
    undefined,
    files,
  ).tick(100);
  const run = data.state.runs[0];
  assert.equal(models, 4);
  assert.equal(run.status, "failed");
  assert.equal(run.steps.filter((s) => s.status === "succeeded").length, 20);
  assert.equal(run.steps.length, 21);
  assert.equal(run.steps.at(-1)?.status, "rejected");
  assert.match(run.error!, /20-action/);
});

test("writes reject forged/uncited Markdown and invalid JSON; structured arrays remain data and generated files are not independent evidence", async () => {
  const data = new AgentStore(),
    files = new AgentFiles(data);
  const input = files.create({
    notebookId: "tools",
    name: "brief.txt",
    content: "Plan three verification checks.",
  });
  let models = 0;
  const fetcher = (async () => {
    const messages = [
      tool("read_file", { fileId: input.id }),
      tool("write_file", {
        name: "forged.md",
        content: "False claim [999]",
        citationIds: [1],
      }),
      tool("write_file", {
        name: "invalid.json",
        content: "not JSON",
        citationIds: [1],
      }),
      tool("write_file", {
        name: "uncited.md",
        content: "Unsupported claim",
        citationIds: [1],
      }),
      tool("write_file", {
        name: "false-page.md",
        content: "File has PDF page 1 [1, p.1]",
        citationIds: [1],
      }),
      tool("write_file", {
        name: "checks.json",
        content: '{"checks":[1,2,3]}',
        citationIds: [1],
      }),
    ];
    models++;
    return response(
      models <= 6
        ? messages[models - 1]
        : models === 7
          ? tool("read_file", { fileId: data.state.runs[0].files![0].id })
          : { content: "Read the approved brief and created checks.json. [1]" },
    );
  }) as typeof fetch;
  data.state.tasks.push(task([input.id], { allowFileWrites: true }));
  await new AgentWorker(
    data,
    new SettingsStore(config),
    fetcher,
    undefined,
    undefined,
    undefined,
    files,
  ).tick(100);
  const run = data.state.runs[0];
  assert.equal(run.status, "completed", run.error);
  assert.equal(run.calls, 8);
  assert.deepEqual(
    run.steps.map((s) => s.status),
    [
      "succeeded",
      "rejected",
      "rejected",
      "rejected",
      "rejected",
      "succeeded",
      "succeeded",
    ],
  );
  assert.equal(run.citations.length, 1);
  assert.equal(run.files?.length, 1);
  assert.deepEqual(JSON.parse(files.read("tools", run.files![0].id).content), {
    checks: [1, 2, 3],
  });
});

test("Markdown writes cannot declare retrieved support that is absent from their inline citations", async () => {
  const data = new AgentStore(),
    files = new AgentFiles(data);
  const inputs = ["First brief.", "Second brief."].map((content, i) =>
    files.create({ notebookId: "tools", name: `brief-${i}.txt`, content }),
  );
  let models = 0;
  const fetcher = (async () => {
    models++;
    return response(
      models === 1
        ? {
            content: null,
            tool_calls: inputs.flatMap(
              (file) => tool("read_file", { fileId: file.id }).tool_calls,
            ),
          }
        : models === 2
          ? tool("write_file", {
              name: "missing.md",
              content: "Only the first brief [1]",
              citationIds: [1, 2],
            })
          : models === 3
            ? tool("write_file", {
                name: "both.md",
                content: "First brief [1]. Second brief [2].",
                citationIds: [1, 2],
              })
            : { content: "Created the file from both briefs. [1, 2]" },
    );
  }) as typeof fetch;
  data.state.tasks.push(
    task(
      inputs.map((f) => f.id),
      { allowFileWrites: true },
    ),
  );
  await new AgentWorker(
    data,
    new SettingsStore(config),
    fetcher,
    undefined,
    undefined,
    undefined,
    files,
  ).tick(100);
  const run = data.state.runs[0];
  assert.equal(run.status, "completed", run.error);
  assert.equal(run.files?.length, 1);
  assert.equal(run.files?.[0].name, "both.md");
  assert.equal(run.steps[2].status, "rejected");
  assert.match(run.steps[2].summary, /every declared supporting citation ID/);
});

test("file API validates uploads and task grants, exposes metadata only, and scopes plain attachment downloads", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-file-api-"));
  const app = createApp(
    config,
    (async () => {
      throw new Error("No inference expected");
    }) as typeof fetch,
    {
      agentFile: path.join(directory, "agent.json"),
      workspaceFile: path.join(directory, "workspace.json"),
      traceSpoolFile: path.join(directory, "trace.jsonl"),
    },
  );
  app.locals.agent.stop();
  await app.locals.workspace.ready;
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (endpoint: string, body: unknown) =>
    fetch(api + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const invalid = await post("/api/agent/files", {
      notebookId: "tools",
      name: "brief.txt",
      content: "APPROVED_FILE_TEXT",
      path: "../private.txt",
    });
    assert.equal(invalid.status, 400);
    const created = await post("/api/agent/files", {
      notebookId: "tools",
      name: "brief.txt",
      content: "APPROVED_FILE_TEXT",
    });
    assert.equal(created.status, 200);
    const file = await created.json();
    const overview = await (await fetch(api + "/api/agent")).text();
    assert.ok(overview.includes(file.id));
    assert.doesNotMatch(
      overview,
      /APPROVED_FILE_TEXT|private-nemotron-test-key/,
    );
    const download = await fetch(
      `${api}/api/agent/files/${file.id}/download?notebookId=tools`,
    );
    assert.equal(download.status, 200);
    assert.equal(await download.text(), "APPROVED_FILE_TEXT");
    assert.match(download.headers.get("content-disposition")!, /attachment/);
    assert.match(download.headers.get("content-type")!, /text\/plain/);
    assert.equal(download.headers.get("x-content-type-options"), "nosniff");
    assert.equal(
      (
        await fetch(
          `${api}/api/agent/files/${file.id}/download?notebookId=other`,
        )
      ).status,
      404,
    );
    const input = {
      notebookId: "tools",
      title: "File task",
      prompt: "Read the brief",
      skillId: "autonomous-tools",
      sourceIds: [],
      fileIds: [file.id],
      dueAt: Date.now(),
    };
    assert.equal(
      (await post("/api/agent/task", { ...input, allowHostFiles: true }))
        .status,
      400,
    );
    assert.equal(
      (await post("/api/agent/task", { ...input, notebookId: "other" })).status,
      409,
    );
    assert.equal((await post("/api/agent/task", input)).status, 200);
    assert.equal(
      (await post("/api/agent/task", { ...input, fileIds: [], allowWeb: true }))
        .status,
      409,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.locals.workspace.repository.close();
    await app.locals.traceStore.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("web connection changes during a real tool boundary stop the run before accepting evidence or writing a file", async () => {
  const data = new AgentStore();
  let web: WebResearch;
  const fetcher = (async (target) => {
    if (String(target).endsWith("/search")) {
      web.value.revision = randomUUID();
      return Response.json({ results: [{ url, title: "Result" }] });
    }
    return response(tool("search_web", { query: "public research" }));
  }) as typeof fetch;
  web = new WebResearch(undefined, fetcher);
  web.save({ apiKey: "fixture-key" });
  web.value.tested = true;
  data.state.tasks.push(
    task([], {
      allowWeb: true,
      allowFileWrites: true,
      webRevision: web.value.revision,
    }),
  );
  await new AgentWorker(
    data,
    new SettingsStore(config),
    fetcher,
    undefined,
    undefined,
    web,
  ).tick(100);
  const run = data.state.runs[0];
  assert.equal(run.status, "failed");
  assert.match(run.error!, /Search connection/);
  assert.equal(run.citations.length, 0);
  assert.equal(run.files?.length, 0);
});

test("tools fail closed when no durable audit destination can be written", async (t) => {
  t.mock.method(console, "info", () => {});
  t.mock.method(console, "warn", () => {});
  const directory = mkdtempSync(path.join(tmpdir(), "nemodoc-audit-failure-"));
  try {
    const data = new AgentStore(),
      files = new AgentFiles(data);
    const input = files.create({
      notebookId: "tools",
      name: "brief.txt",
      content: "Approved.",
    });
    const traces = new TraceStore(undefined, directory); // A directory cannot be the JSONL file.
    const fetcher = (async () =>
      response(
        tool("update_plan", { text: "This must not be saved." }),
      )) as typeof fetch;
    data.state.tasks.push(task([input.id]));
    await new AgentWorker(
      data,
      new SettingsStore(config),
      fetcher,
      undefined,
      traces,
      undefined,
      files,
    ).tick(100);
    assert.equal(data.state.plans.length, 0);
    assert.ok(
      data.state.runs[0].steps.every(
        (s) =>
          s.status === "rejected" && /audit log is unavailable/.test(s.summary),
      ),
    );
    await traces.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
