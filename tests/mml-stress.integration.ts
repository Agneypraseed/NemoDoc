import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { SMTPServer } from "smtp-server";
import { generate } from "selfsigned";
import { createApp } from "../server/app.ts";
import { connectionInput } from "../server/agent-connections.ts";
import { createSmtpTransport } from "../server/smtp.ts";
import { mmlSnapshot } from "./fixtures/mml-workspace.ts";
import type { WorkspaceWorker } from "../server/workspace/worker.ts";
import type { WorkspaceService } from "../server/workspace/service.ts";
import type { WorkspaceRepository } from "../server/workspace/repository.ts";

test(
  "MML PostgreSQL/API stress: parallel queues, approval/edit races, SMTP, scheduled recovery and revoked evidence",
  { timeout: 300000 },
  async () => {
    for (const name of ["TEST_DATABASE_URL", "TEST_READ_DATABASE_URL"]) {
      const u = new URL(process.env[name] || "postgresql://invalid/invalid");
      assert.ok(
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
          u.pathname.endsWith("_test"),
        "Use an isolated loopback _test database.",
      );
    }
    const cert = await generate([{ name: "commonName", value: "localhost" }], {
      extensions: [
        { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }] },
      ],
    });
    const received: string[] = [];
    const smtp = new SMTPServer({
      secure: true,
      key: cert.private,
      cert: cert.cert,
      closeTimeout: 1000,
      onAuth: (_a, _s, cb) => cb(null, { user: "fixture" }),
      onData: (stream, _s, cb) => {
        const chunks: Buffer[] = [];
        stream.on("data", (d) => chunks.push(Buffer.from(d)));
        stream.on("end", () => {
          received.push(Buffer.concat(chunks).toString());
          cb();
        });
      },
    });
    await new Promise<void>((r) => smtp.listen(0, "127.0.0.1", r));
    const dueAt = Date.now() + 86400000;
    const scripted: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const results = body.messages.filter((m: any) => m.role === "tool");
      const call = (name: string, args: unknown, id: string) => ({
        id,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      });
      let message: any;
      if (results.length === 0)
        message = {
          content: null,
          tool_calls: [
            call("query_notes", {}, "notes"),
            call("query_quiz_progress", {}, "progress"),
            call("query_review_tasks", {}, "reviews"),
          ],
        };
      else if (results.length === 3)
        message = {
          content: null,
          tool_calls: [
            call("read_passage", { sourceId: "mml-book", page: 50 }, "basis"),
            call("read_passage", { sourceId: "mml-book", page: 77 }, "norm"),
          ],
        };
      else if (results.length === 5) {
        const items = Array.from({ length: 3 }, (_, i) => ({
          question: `TEST ${i + 1}: Can a basis have a redundant vector?`,
          answer: "No. A basis is a linearly independent generating set.",
          choices: ["Yes", "No"],
          correct: 1,
          citationIds: [4],
        }));
        message = {
          content: null,
          tool_calls: [
            call(
              "propose_actions",
              {
                actions: [
                  ...["guide", "quiz", "flashcards"].map((materialKind) => ({
                    kind: "save_material",
                    materialKind,
                    title: `MML TEST ${materialKind}`,
                    content:
                      "A basis is a linearly independent generating set. [4] A norm satisfies absolute homogeneity, triangle inequality and positive definiteness. [5]",
                    items: materialKind === "guide" ? [] : items,
                    evidenceIds: [1, 4, 5],
                  })),
                  {
                    kind: "update_plan",
                    text: "Recall the basis definition [4], then practice norm axioms [5].",
                    evidenceIds: [1, 4, 5],
                  },
                  {
                    kind: "schedule_review",
                    title: "MML TEST scheduled recall",
                    prompt:
                      "Query approved notes and retrieve PDF pages 50 and 77. Propose cited practice for approval; send no email.",
                    dueAt,
                    evidenceIds: [1, 4, 5],
                  },
                  {
                    kind: "send_email",
                    title: "MML TEST approved guide",
                    text: "A basis is a linearly independent generating set. [4]",
                    evidenceIds: [1, 4],
                  },
                ],
              },
              "proposal",
            ),
          ],
        };
      } else
        message = {
          content:
            "The approved notes are in [1]. Basis and norms are supported by [4] and [5]. Review the structured proposal; nothing is applied before approval.",
        };
      return Response.json({
        choices: [{ message }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });
    };
    const app = createApp(
      {
        apiKey: "fixture-key",
        baseUrl: "https://api.tokenfactory.nebius.com/v1",
        model: "nvidia/test-nemotron",
      },
      scripted,
      {
        databaseUrl: process.env.TEST_DATABASE_URL,
        readDatabaseUrl: process.env.TEST_READ_DATABASE_URL,
        smtpTransportFactory: (options) =>
          createSmtpTransport({
            ...options,
            tls: { ...options.tls, ca: cert.cert, servername: "localhost" },
          }),
      },
    );
    const {
      repository: repo,
      service,
      worker,
      ready,
    } = app.locals.workspace as {
      repository: WorkspaceRepository;
      service: WorkspaceService;
      worker: WorkspaceWorker;
      ready: Promise<void>;
    };
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.on("listening", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/agent/workspace`;
    const timings: number[] = [];
    const post = async (route: string, input: unknown, expect = 200) => {
      const start = performance.now();
      const response = await fetch(base + route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      timings.push(performance.now() - start);
      assert.equal(response.status, expect, JSON.stringify(result));
      return result;
    };
    const ids = Array.from({ length: 8 }, () => `mml-stress-${randomUUID()}`);
    try {
      await ready;
      service.connections.save(
        connectionInput.parse({
          section: "email",
          smtpHost: "127.0.0.1",
          smtpPort: (smtp.server.address() as AddressInfo).port,
          smtpSecurity: "tls",
          smtpUser: "fixture@example.com",
          from: "fixture@example.com",
          recipient: "owner@example.com",
          password: "test-only",
        }),
      );
      await Promise.all(ids.map((id) => post("/snapshot", mmlSnapshot(id))));
      // Repeat the same full 417-page snapshot concurrently. It must remain stable.
      await Promise.all(
        Array.from({ length: 16 }, () =>
          post("/snapshot", mmlSnapshot(ids[0])),
        ),
      );
      for (let round = 0; round < 2; round++) {
        await Promise.all(
          ids.map((notebookId, i) =>
            post("/run", {
              notebookId,
              workflow: i % 2 ? "research_synthesis" : "study_revision",
              prompt:
                "MML TEST: propose guide, quiz, flashcards, plan, review and optional email for explicit approval.",
              sourceIds: ["mml-book"],
              noteIds: ["basis-note", "norm-note"],
              includeProgress: true,
            }),
          ),
        );
        await Promise.all(
          ids.map((notebookId, i) =>
            post(
              "/run",
              {
                notebookId,
                workflow: i % 2 ? "research_synthesis" : "study_revision",
                prompt: "Reject this duplicate active task",
                sourceIds: ["mml-book"],
                noteIds: ["basis-note"],
                includeProgress: true,
              },
              409,
            ),
          ),
        );
        await worker.tick();
      }
      assert.equal(received.length, 0, "No mail before approval.");
      let approvals = 0;
      for (const notebookId of ids) {
        const state = await repo.read(notebookId);
        assert.equal(state.runs.length, 2);
        assert.ok(
          state.runs.every((r) => r.status === "completed"),
          state.runs.map((r) => r.error).join(";"),
        );
        assert.equal(state.materials.length, 0);
        for (const p of state.proposals) {
          const edits = {
            notebookId,
            id: p.id,
            revision: p.revision,
            actions: p.actions.map(({ id, ...action }) => ({ id, action })),
          };
          // Exactly one concurrent editor may advance a revision.
          const editsResults = await Promise.all(
            Array.from({ length: 4 }, async () => {
              const r = await fetch(base + "/proposal/edit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(edits),
              });
              await r.json();
              return r.status;
            }),
          );
          assert.equal(editsResults.filter((s) => s === 200).length, 1);
          assert.equal(editsResults.filter((s) => s === 409).length, 3);
          await post(
            "/proposal/approve",
            {
              notebookId,
              id: p.id,
              revision: 1,
              actionIds: p.actions.map((a) => a.id),
              idempotencyKey: `stale-${p.id}`,
              confirm: true,
            },
            409,
          );
          const input = {
            notebookId,
            id: p.id,
            revision: 2,
            actionIds: p.actions.map((a) => a.id),
            idempotencyKey: `once-${p.id}`,
            confirm: true,
          };
          const receipts = await Promise.all(
            Array.from({ length: 16 }, () => post("/proposal/approve", input)),
          );
          assert.ok(receipts.every((r) => r.at === receipts[0].at));
          approvals++;
          await post(
            "/proposal/approve",
            { ...input, idempotencyKey: `different-${p.id}` },
            409,
          );
        }
        const applied = await repo.read(notebookId);
        assert.equal(applied.receipts.length, 2);
        assert.equal(applied.materials.length, 6);
        assert.equal(applied.reviews.length, 2);
        assert.equal(applied.outbox.length, 2);
        assert.equal(new Set(applied.materials.map((m) => m.id)).size, 6);
        assert.ok(applied.materials.every((m) => m.citations.length > 0));
      }
      await worker.tick();
      assert.equal(received.length, 16);
      await worker.tick();
      assert.equal(
        received.length,
        16,
        "Retrying worker must not resend accepted email.",
      );
      await worker.recover();
      await worker.tick(dueAt + 1);
      await worker.tick(dueAt + 2);
      for (const id of ids) {
        const s = await repo.read(id);
        assert.equal(s.runs.length, 4);
        assert.ok(s.reviews.every((r) => r.status === "completed"));
        assert.equal(
          s.materials.length,
          6,
          "Scheduled results require another human approval.",
        );
        assert.equal(
          s.proposals.filter((p) => p.status === "pending").length,
          2,
        );
        const pending = s.proposals.find((p) => p.status === "pending")!;
        await post("/proposal/reject", {
          notebookId: id,
          id: pending.id,
          revision: pending.revision,
        });
        await post(
          "/proposal/approve",
          {
            notebookId: id,
            id: pending.id,
            revision: pending.revision,
            actionIds: [pending.actions[0].id],
            idempotencyKey: "reject",
            confirm: true,
          },
          409,
        );
        await post("/revoke", { notebookId: id, confirm: true });
        const other = s.proposals.find(
          (p) => p.status === "pending" && p.id !== pending.id,
        )!;
        await post(
          "/proposal/approve",
          {
            notebookId: id,
            id: other.id,
            revision: other.revision,
            actionIds: [other.actions[0].id],
            idempotencyKey: "revoked",
            confirm: true,
          },
          409,
        );
      }
      assert.equal(received.length, 16);
      timings.sort((a, b) => a - b);
      const report = {
        mode: "scripted model; real MML snapshots, PostgreSQL, HTTP and TLS SMTP",
        notebooks: 8,
        parentRuns: 16,
        scheduledRuns: 16,
        approvalRequests: 16 * 16,
        committedApprovals: approvals,
        emailMessages: received.length,
        apiRequestsMeasured: timings.length,
        apiP50Ms: Math.round(timings[Math.floor(timings.length * 0.5)]),
        apiP95Ms: Math.round(timings[Math.floor(timings.length * 0.95)]),
        apiMaxMs: Math.round(timings.at(-1)!),
        passed: true,
      };
      mkdirSync("output/evaluations", { recursive: true });
      writeFileSync(
        "output/evaluations/mml-stress.json",
        JSON.stringify(report, null, 2),
      );
      console.log(JSON.stringify(report));
    } finally {
      worker.stop();
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
      await repo.close();
      await new Promise<void>((r) => smtp.close(r));
    }
  },
);
