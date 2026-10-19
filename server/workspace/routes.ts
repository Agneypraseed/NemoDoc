import type express from "express";
import { z } from "zod";
import type { AgentConnectionStore } from "../agent-connections.ts";
import {
  JsonWorkspaceRepository,
  PostgresWorkspaceRepository,
  type WorkspaceRepository,
} from "./repository.ts";
import { scopeId, WorkspaceService } from "./service.ts";
import { WorkspaceWorker } from "./worker.ts";
import type { RuntimeResearchTarget } from "./service.ts";
import type { TraceStore } from "../trace-store.ts";

export function registerWorkspace(
  app: express.Express,
  connections: AgentConnectionStore,
  fetcher: typeof fetch,
  options: {
    workspaceFile?: string;
    databaseUrl?: string;
    readDatabaseUrl?: string;
    repository?: WorkspaceRepository;
    startWorker?: boolean;
    listRuntimeAgentIds?: () => Promise<string[]>;
    listRuntimeAgentTargets?: () => Promise<RuntimeResearchTarget[]>;
    expectedNvidiaModel?: string;
    traces?: TraceStore;
  } = {},
) {
  if (options.databaseUrl && !options.readDatabaseUrl)
    throw new Error(
      "Set AGENT_READ_DATABASE_URL to a restricted read-only PostgreSQL role.",
    );
  const repository =
    options.repository ??
    (options.databaseUrl
      ? new PostgresWorkspaceRepository(
          options.databaseUrl,
          options.readDatabaseUrl!,
        )
      : new JsonWorkspaceRepository(options.workspaceFile));
  const service = new WorkspaceService(
      repository,
      connections,
      options.listRuntimeAgentIds,
      options.listRuntimeAgentTargets,
      options.expectedNvidiaModel,
      options.traces,
    ),
    worker = new WorkspaceWorker(service, fetcher, options.traces);
  const ready = repository
    .initialize()
    .then(() => options.traces?.initialize())
    .then(() => worker.recover())
    .then(() => {
      if (options.startWorker) worker.start();
    });
  // Attach a rejection handler immediately; routes and server startup still await the original promise.
  void ready.catch(() =>
    console.warn(
      "Agent workspace initialization failed. Check database setup and read-role permissions.",
    ),
  );
  app.locals.workspace = {
    repository,
    service,
    worker,
    traces: options.traces,
    ready,
  };
  const route = (url: string, action: (body: any) => Promise<unknown>) =>
    app.post(url, async (req, res) => {
      try {
        await ready;
        res.json(await action(req.body));
      } catch (e) {
        res.status(e instanceof z.ZodError ? 400 : 409).json({
          error:
            e instanceof z.ZodError
              ? "Check the workspace fields and evidence selection."
              : (e as Error).message,
        });
      }
    });
  app.get("/api/agent/workspace/status", async (_req, res) => {
    try {
      await ready;
      res.json({
        backend: repository.kind,
        ready: true,
        tracePersistence: options.traces?.status() ?? "degraded",
      });
    } catch {
      res.status(503).json({
        error:
          "Agent workspace is unavailable. Check database migrations and permissions.",
      });
    }
  });
  app.get("/api/agent/workspace/research-prerequisites", async (_req, res) => {
    try {
      await ready;
      res.setHeader("Cache-Control", "no-store");
      res.json(await service.researchPrerequisites());
    } catch (error) {
      res.status(503).json({
        available: false,
        message: (error as Error).message,
        targets: [],
      });
    }
  });
  app.get("/api/agent/workspace/:notebookId", async (req, res) => {
    try {
      await ready;
      res.json(await repository.read(scopeId.parse(req.params.notebookId)));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  if (options.traces) {
    const notebookParam = (value: unknown) => scopeId.parse(value);
    app.get("/api/agent/workspace/:notebookId/traces", async (req, res) => {
      try {
        await ready;
        res.setHeader("Cache-Control", "no-store");
        res.json({
          traces: await options.traces!.list(
            notebookParam(req.params.notebookId),
          ),
          persistence: options.traces!.status(),
        });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });
    app.get(
      "/api/agent/workspace/:notebookId/traces/metrics",
      async (req, res) => {
        try {
          await ready;
          res.setHeader("Cache-Control", "no-store");
          const notebookId = notebookParam(req.params.notebookId);
          const since = z.coerce
            .number()
            .int()
            .nonnegative()
            .optional()
            .parse(req.query.since);
          res.json(await options.traces!.metrics(notebookId, since));
        } catch (error) {
          res.status(400).json({ error: (error as Error).message });
        }
      },
    );
    app.get(
      "/api/agent/workspace/:notebookId/traces/:traceId/events",
      async (req, res) => {
        try {
          await ready;
          res.setHeader("Cache-Control", "no-store");
          const notebookId = notebookParam(req.params.notebookId);
          const traceId = z.string().uuid().parse(req.params.traceId);
          if (!(await options.traces!.detail(notebookId, traceId)))
            return res.status(404).json({ error: "Run trace not found." });
          const after = z.coerce
            .number()
            .int()
            .nonnegative()
            .default(0)
            .parse(req.query.after);
          const limit = z.coerce
            .number()
            .int()
            .min(1)
            .max(500)
            .default(200)
            .parse(req.query.limit);
          res.json(
            await options.traces!.events(notebookId, traceId, after, limit),
          );
        } catch (error) {
          res.status(400).json({ error: (error as Error).message });
        }
      },
    );
    app.get(
      "/api/agent/workspace/:notebookId/traces/:traceId",
      async (req, res) => {
        try {
          await ready;
          res.setHeader("Cache-Control", "no-store");
          const detail = await options.traces!.detail(
            notebookParam(req.params.notebookId),
            z.string().uuid().parse(req.params.traceId),
          );
          if (!detail)
            return res.status(404).json({ error: "Run trace not found." });
          res.json(detail);
        } catch (error) {
          res.status(400).json({ error: (error as Error).message });
        }
      },
    );
  }
  route("/api/agent/workspace/snapshot", (body) => service.snapshot(body));
  route("/api/agent/workspace/progress", (body) => service.recordAttempt(body));
  route("/api/agent/workspace/run", (body) => service.queue(body));
  route("/api/agent/workspace/revoke", (body) =>
    service.revoke(
      z
        .object({ notebookId: scopeId, confirm: z.literal(true) })
        .strict()
        .parse(body).notebookId,
    ),
  );
  route("/api/agent/workspace/proposal/edit", (body) => service.edit(body));
  route("/api/agent/workspace/proposal/approve", (body) =>
    service.approve(body),
  );
  route("/api/agent/workspace/proposal/reject", (body) => service.reject(body));
  route("/api/agent/workspace/review/complete", (body) => {
    const input = z
      .object({ notebookId: scopeId, id: scopeId })
      .strict()
      .parse(body);
    return repository.transaction(input.notebookId, (s) => {
      const review = s.reviews.find((r) => r.id === input.id);
      if (!review) throw new Error("Review not found in this notebook.");
      review.status = "completed";
      return { ok: true };
    });
  });
  return { repository, service, worker, ready };
}
