import type express from "express";
import { z } from "zod";
import type { AgentWorker } from "./agent.ts";
import type { WorkspaceService } from "./workspace/service.ts";
import type {
  AgentDashboard,
  NotebookAgentActivity,
} from "../src/agent-monitor-types.ts";

/** Local task and workflow activity for the selected notebook. */
export function registerAgentMonitor(
  app: express.Express,
  worker: AgentWorker,
) {
  app.get("/api/agent/overview", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const parsed = z.string().min(1).max(100).safeParse(req.query.notebookId);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Choose a notebook to view its agent activity." });
    const notebookId = parsed.data;
    const clean = (value: string) => {
      const secrets = [
        worker.connections.runtime().apiKey,
        worker.connections.value.email.password,
        worker.connections.value.whatsapp.apiKey,
      ].filter(Boolean);
      return secrets
        .reduce((text, secret) => text.split(secret).join("[redacted]"), value)
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
        .slice(0, 2000);
    };
    const activity: NotebookAgentActivity[] = worker.data.state.runs
      .filter((run) => run.notebookId === notebookId)
      .slice(0, 50)
      .map((run) => ({
        id: run.id,
        agentId: "notebook-agent",
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
      for (const run of state.runs.slice(0, 50)) {
        const team =
          run.workflow === "research_team" ? (run.researchTeam ?? []) : [];
        if (team.length) {
          activity.push(
            ...team.map((specialist) => ({
              id: `${run.id}:${specialist.id}`,
              agentId: specialist.id,
              kind: "workflow" as const,
              title: `Research · ${specialist.name}`,
              status: specialist.status,
              summary:
                specialist.error ||
                run.steps
                  .filter((step) => step.summary.includes(specialist.name))
                  .at(-1)?.summary ||
                (specialist.status === "queued"
                  ? "Waiting for the research team"
                  : "Research started"),
              updatedAt:
                run.finishedAt ||
                run.steps.at(-1)?.at ||
                run.startedAt ||
                run.createdAt,
              model: specialist.assignedModel || run.connection.model,
              steps: run.steps.slice(-8),
              pendingApproval: false,
              delivery: "",
            })),
          );
        } else {
          activity.push({
            id: run.id,
            agentId: "notebook-agent",
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
              (proposal) =>
                proposal.runId === run.id && proposal.status === "pending",
            ),
            delivery: state.outbox
              .filter((item) =>
                state.proposals.some(
                  (proposal) =>
                    proposal.id === item.proposalId &&
                    proposal.runId === run.id,
                ),
              )
              .map((item) => `email: ${item.status}`)
              .join(", "),
          });
        }
      }
    } catch {
      notebookError =
        "Notebook workflow activity is unavailable. Check the workspace database.";
    }
    const dashboard: AgentDashboard = {
      connection: worker.connections.public().model,
      notebookActivity: activity
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 50),
      notebookError,
    };
    res.json(
      JSON.parse(
        JSON.stringify(dashboard, (key, value) =>
          ["title", "summary", "model", "delivery"].includes(key) &&
          typeof value === "string"
            ? clean(value)
            : value,
        ),
      ),
    );
  });
}
