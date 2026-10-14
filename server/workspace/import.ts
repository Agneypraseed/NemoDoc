import { z } from "zod";
import { sharedSource } from "../../src/agent-types.ts";
import { snapshotSchema } from "../../src/workspace-types.ts";

/** Explicit migration of already-approved legacy source snapshots; never reads browser data. */
export function legacySnapshots(raw: unknown) {
  const legacy = z
    .object({ version: z.literal(1), sources: z.array(sharedSource).max(1000) })
    .parse(raw);
  const ids = [...new Set(legacy.sources.map((s) => s.notebookId))];
  return ids.map((notebookId) => {
    const approved = legacy.sources.filter((s) => s.notebookId === notebookId);
    return snapshotSchema.parse({
      notebookId,
      title: `Imported notebook ${notebookId}`,
      consent: true,
      sources: approved
        .filter((s) => s.kind !== "notes")
        .map(({ id, name, pages }) => ({ id, name, pages })),
      notes: approved
        .filter((s) => s.kind === "notes")
        .map((s) => ({
          id: s.id,
          title: s.name,
          text: s.pages.join("\n\n"),
          kind: "notebook",
          tags: ["legacy-approved"],
          references: [],
        })),
    });
  });
}
