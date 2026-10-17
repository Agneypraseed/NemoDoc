import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import type express from "express";
import { z } from "zod";
import type { AgentConnectionStore } from "./agent-connections.ts";
import type { AgentWorker } from "./agent.ts";
import type { WorkspaceService } from "./workspace/service.ts";
import type {
  AgentDashboard,
  AgentRuntimeSnapshot,
  NotebookAgentActivity,
  RuntimeActivity,
} from "../src/agent-monitor-types.ts";

export type NemoClawReader = (args: string[]) => Promise<string>;
export const nativeNemoClawRead: NemoClawReader = (args) =>
  new Promise((resolve, reject) => {
    execFile(
      "nemoclaw",
      args,
      { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
const agentId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const text = z.string().max(2000);
const roster = z
  .array(
    z.object({
      id: agentId,
      name: text.optional(),
      identityName: text.optional(),
      identityEmoji: z.string().max(32).optional(),
      model: text.optional(),
      isDefault: z.boolean().optional(),
    }),
  )
  .max(500);
const sessions = z.object({
  sessions: z
    .array(
      z.object({
        key: z.string().max(2000),
        agentId: agentId.optional(),
        label: text.optional(),
        displayName: text.optional(),
        status: z
          .enum(["queued", "running", "done", "failed", "killed", "timeout"])
          .optional(),
        hasActiveRun: z.boolean().optional(),
        abortedLastRun: z.boolean().optional(),
        updatedAt: z.number().nonnegative().nullish(),
        model: text.optional(),
        totalTokens: z.number().nonnegative().nullish(),
        observerDigest: z
          .object({
            headline: text,
            health: z.string().max(100),
            updatedAt: z.number().nonnegative().optional(),
          })
          .nullish(),
      }),
    )
    .max(100),
  hasMore: z.boolean().optional(),
  totalCount: z.number().nonnegative().optional(),
});

export class AgentRuntimeMonitor {
  private cached?: { key: string; snapshot: AgentRuntimeSnapshot };
  private pending?: { key: string; result: Promise<AgentRuntimeSnapshot> };
  constructor(
    private connections: AgentConnectionStore,
    private fetcher: typeof fetch,
    private sandbox?: string,
    private reader: NemoClawReader = nativeNemoClawRead,
  ) {}
  snapshot(): Promise<AgentRuntimeSnapshot> {
    const key = createHash("sha256")
      .update(
        JSON.stringify(this.connections.runtime()) +
          this.connections.value.model.mode,
      )
      .digest("hex");
    if (
      this.cached?.key === key &&
      Date.now() - this.cached.snapshot.checkedAt < 5000
    )
      return Promise.resolve(this.cached.snapshot);
    if (this.pending?.key === key) return this.pending.result;
    const result = this.read()
      .then((snapshot) => {
        this.cached = { key, snapshot };
        return snapshot;
      })
      .finally(() => {
        if (this.pending?.result === result) this.pending = undefined;
      });
    this.pending = { key, result };
    return result;
  }
  private async read(): Promise<AgentRuntimeSnapshot> {
    const base: AgentRuntimeSnapshot = {
      status: "not_configured",
      source: "none",
      sandbox: this.sandbox,
      checkedAt: Date.now(),
      message:
        "Connect an OpenClaw gateway in Connections, or enable monitoring on your NemoClaw host.",
      agents: [],
      activity: [],
      hasMore: false,
    };
    let hostFailed = false;
    if (this.sandbox) {
      // The browser cannot choose commands, RPC methods, paths or sandbox names.
      // Names are host configuration, but validate them before building argv too.
      if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(this.sandbox))
        return {
          ...base,
          status: "unavailable",
          message: "Invalid NemoClaw sandbox name in server configuration.",
        };
      try {
        const rows = roster.parse(
          JSON.parse(
            await this.reader([this.sandbox, "agents", "list", "--json"]),
          ),
        );
        const known = new Set(rows.map((row) => row.id));
        const agents = rows.map((row) => ({
          id: row.id,
          name: row.identityName || row.name || row.id,
          emoji: row.identityEmoji,
          model: row.model,
          isDefault: row.isDefault === true,
        }));
        try {
          const live = sessions.parse(
            JSON.parse(
              await this.reader([
                this.sandbox,
                "exec",
                "--",
                "openclaw",
                "gateway",
                "call",
                "sessions.list",
                "--params",
                JSON.stringify({
                  limit: 100,
                  includeGlobal: false,
                  includeUnknown: false,
                  includeDerivedTitles: false,
                  includeLastMessage: false,
                }),
                "--json",
              ]),
            ),
          );
          const activity: RuntimeActivity[] = live.sessions.flatMap((row) => {
            const owner = row.key.match(/^agent:([a-z0-9_-]+):/);
            const id = row.agentId || owner?.[1];
            // Do not attach global/unowned or hidden internal sessions to an agent.
            if (
              !id ||
              !known.has(id) ||
              row.key.includes("nemoclaw-onboard-warmup-")
            )
              return [];
            const health = row.observerDigest?.health;
            const status =
              health === "waiting-on-user"
                ? "waiting"
                : row.hasActiveRun === true ||
                    (row.hasActiveRun === undefined && row.status === "running")
                  ? "running"
                  : row.status === "queued"
                    ? "queued"
                    : row.status === "done"
                      ? "completed"
                      : row.status === "failed" ||
                          row.status === "timeout" ||
                          health === "failed"
                        ? "failed"
                        : row.status === "killed" || row.abortedLastRun
                          ? "interrupted"
                          : "unknown";
            return [
              {
                id: createHash("sha256")
                  .update(row.key)
                  .digest("hex")
                  .slice(0, 24),
                agentId: id,
                title: row.label || row.displayName || "OpenClaw session",
                status,
                summary:
                  row.observerDigest?.headline ||
                  (status === "unknown"
                    ? "Session recorded; current work details are not reported."
                    : "Session status reported by OpenClaw."),
                updatedAt: row.updatedAt ?? undefined,
                model: row.model,
                tokens: row.totalTokens ?? undefined,
              },
            ];
          });
          return {
            ...base,
            status: "connected",
            source: "nemoclaw",
            checkedAt: Date.now(),
            message:
              "Live agent roster and session activity from your NemoClaw host.",
            agents,
            activity,
            hasMore:
              live.hasMore === true ||
              (live.totalCount ?? 0) > live.sessions.length,
          };
        } catch {
          return {
            ...base,
            status: "partial",
            source: "nemoclaw",
            checkedAt: Date.now(),
            message:
              "Agent roster connected. Live session activity is unavailable; check the OpenClaw gateway on this runtime host.",
            agents,
          };
        }
      } catch {
        hostFailed = true;
      }
    }
    // Remote connections can expose their inventory over HTTP, without granting
    // a model access to monitoring tools or introducing a general RPC proxy.
    if (this.connections.value.model.mode === "openclaw") {
      const config = this.connections.runtime();
      if (config.apiKey)
        try {
          const response = await this.fetcher(
            config.baseUrl.replace(/\/$/, "") + "/models",
            {
              headers: { Authorization: `Bearer ${config.apiKey}` },
              redirect: "error",
              signal: AbortSignal.timeout(10000),
            },
          );
          if (!response.ok) throw new Error("inventory unavailable");
          const catalog = z
            .object({ data: z.array(z.object({ id: text })).max(1000) })
            .parse(await response.json());
          const ids = [
            ...new Set(
              catalog.data
                .map(
                  (row) =>
                    /^openclaw\/([a-z0-9][a-z0-9_-]{0,63})$/.exec(row.id)?.[1],
                )
                .filter((id): id is string => !!id),
            ),
          ];
          return {
            ...base,
            status: "partial",
            source: "gateway",
            checkedAt: Date.now(),
            message:
              "Agent inventory from the gateway. Live sessions require the NemoDoc server to run on your NemoClaw host with monitoring enabled.",
            agents: ids.map((id) => ({ id, name: id, isDefault: false })),
          };
        } catch {
          return {
            ...base,
            status: "unavailable",
            checkedAt: Date.now(),
            message:
              "Could not load your agents. Check the saved gateway URL/token and the NemoClaw runtime host.",
          };
        }
    }
    return hostFailed
      ? {
          ...base,
          status: "unavailable",
          checkedAt: Date.now(),
          message:
            "NemoClaw is unavailable on this server. Install/start your dedicated runtime or connect its gateway in Connections.",
        }
      : base;
  }
}

export function registerAgentMonitor(
  app: express.Express,
  worker: AgentWorker,
  fetcher: typeof fetch,
  sandbox?: string,
  reader?: NemoClawReader,
) {
  const monitor = new AgentRuntimeMonitor(
    worker.connections,
    fetcher,
    sandbox,
    reader,
  );
  app.get("/api/agent/overview", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const parsed = z.string().min(1).max(100).safeParse(req.query.notebookId);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Choose a notebook to view its agent activity." });
    const notebookId = parsed.data;
    const runtime = await monitor.snapshot();
    const clean = (value: string) => {
      const secrets = [
        worker.connections.runtime().apiKey,
        worker.connections.value.email.password,
        worker.connections.value.whatsapp.apiKey,
      ].filter(Boolean);
      return secrets
        .reduce((s, secret) => s.split(secret).join("[redacted]"), value)
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
        .slice(0, 2000);
    };
    const model = worker.connections.public().model;
    const activity: NotebookAgentActivity[] = worker.data.state.runs
      .filter((run) => run.notebookId === notebookId)
      .slice(0, 50)
      .map((run) => ({
        id: run.id,
        agentId: run.connection.model.startsWith("openclaw/")
          ? run.connection.model.slice(9)
          : "notebook-agent",
        kind: "task",
        title: run.title,
        status: run.status === "cancelled" ? "interrupted" : run.status,
        summary: run.error || run.steps.at(-1)?.summary || "Task started",
        updatedAt: run.finishedAt || run.steps.at(-1)?.at || run.startedAt,
        model: run.connection.model,
        steps: run.steps.slice(-8),
        pendingApproval: false,
        delivery: run.deliveries
          ?.map((d) => `${d.channel}: ${d.status}`)
          .join(", "),
      }));
    let notebookError: string | undefined;
    try {
      const workspace: { service: WorkspaceService; ready: Promise<void> } =
        app.locals.workspace;
      await workspace.ready;
      const state = await workspace.service.repository.readActivity(notebookId);
      for (const run of state.runs.slice(0, 50))
        activity.push({
          id: run.id,
          agentId:
            run.connection.mode === "openclaw"
              ? run.connection.model.slice(9)
              : "notebook-agent",
          kind: "workflow",
          title:
            run.workflow === "study_revision"
              ? "Study revision"
              : "Research synthesis",
          status: run.status,
          summary:
            run.error ||
            run.steps.at(-1)?.summary ||
            (run.status === "queued"
              ? "Waiting for the worker"
              : "Workflow started"),
          updatedAt:
            run.finishedAt ||
            run.steps.at(-1)?.at ||
            run.startedAt ||
            run.createdAt,
          model: run.connection.model,
          steps: run.steps.slice(-8),
          pendingApproval: state.proposals.some(
            (p) => p.runId === run.id && p.status === "pending",
          ),
          delivery: state.outbox
            .filter((o) =>
              state.proposals.some(
                (p) => p.id === o.proposalId && p.runId === run.id,
              ),
            )
            .map((o) => `email: ${o.status}`)
            .join(", "),
        });
    } catch {
      notebookError =
        "Notebook workflow activity is unavailable. Check the workspace database.";
    }
    // Whitelist above; redact known app credentials from any human-readable
    // runtime titles/headlines. Never return CLI diagnostics, paths or transcripts.
    const dashboard: AgentDashboard = {
      runtime,
      connection: {
        mode: model.mode,
        model: model.model,
        tested: model.tested,
      },
      notebookActivity: activity
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 50),
      notebookError,
    };
    const displayFields = new Set([
      "name",
      "emoji",
      "title",
      "summary",
      "model",
      "delivery",
      "message",
    ]);
    res.json(
      JSON.parse(
        JSON.stringify(dashboard, (key, value) =>
          displayFields.has(key) && typeof value === "string"
            ? clean(value)
            : value,
        ),
      ),
    );
  });
}
