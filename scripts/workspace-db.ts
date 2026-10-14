import "dotenv/config";
import { readFileSync } from "node:fs";
import { PostgresWorkspaceRepository } from "../server/workspace/repository.ts";
import { snapshotSchema, quizAttemptSchema } from "../src/workspace-types.ts";
import { WorkspaceService } from "../server/workspace/service.ts";
import { AgentConnectionStore } from "../server/agent-connections.ts";
import { SettingsStore } from "../server/settings.ts";
import { legacySnapshots } from "../server/workspace/import.ts";

if (!process.env.DATABASE_URL || !process.env.AGENT_READ_DATABASE_URL)
  throw new Error("Configure DATABASE_URL and AGENT_READ_DATABASE_URL first.");
const repo = new PostgresWorkspaceRepository(
  process.env.DATABASE_URL,
  process.env.AGENT_READ_DATABASE_URL,
);
try {
  await repo.initialize();
  if (process.argv[2] === "import") {
    const legacy = process.argv[3] === "--legacy-approved";
    const filename = process.argv[legacy ? 4 : 3];
    if (!filename)
      throw new Error(
        "Pass an explicit approved workspace export filename. Browser notebooks and legacy permissions are never imported implicitly.",
      );
    const raw = JSON.parse(readFileSync(filename, "utf8"));
    const states = legacy
      ? legacySnapshots(raw)
      : raw.version === 1
        ? raw.notebooks
        : [raw];
    if (!Array.isArray(states)) throw new Error("Invalid workspace export.");
    const service = new WorkspaceService(
      repo,
      new AgentConnectionStore(
        new SettingsStore({
          apiKey: "",
          baseUrl: "http://localhost:8000/v1",
          model: "nvidia/test-nemotron",
        }),
      ),
    );
    for (const state of states) {
      const snapshot = snapshotSchema.parse({
        notebookId: state.notebookId,
        title: state.title,
        sources: state.sources,
        notes: state.notes,
        consent: true,
      });
      await service.snapshot(snapshot);
      for (const attempt of state.attempts ?? [])
        await service.recordAttempt(
          quizAttemptSchema.parse({ ...attempt, consent: true }),
        );
    }
    console.log(
      "Approved evidence imported idempotently. Original file preserved. Runs, approvals and deliveries were not replayed.",
    );
  } else console.log("Database migrations and read-role checks passed.");
} finally {
  await repo.close();
}
