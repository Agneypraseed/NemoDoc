import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema } from "../src/workspace-types.ts";
import { snapshot } from "./fixtures/evidence-workspace.ts";
import { PostgresWorkspaceRepository } from "../server/workspace/repository.ts";

test("PostgreSQL rejects incompatible text encoding before migrations or imports", async () => {
  const repo = new PostgresWorkspaceRepository(
    "postgresql://localhost/not-used",
    "postgresql://localhost/not-used",
  );
  const query = mock.method(repo.pool, "query", async () => ({
    rows: [{ server_encoding: "WIN1252" }],
  }));
  try {
    await assert.rejects(
      repo.initialize(),
      /requires a UTF8 PostgreSQL database/,
    );
    assert.equal(query.mock.callCount(), 1);
    assert.equal(query.mock.calls[0].arguments[0], "SHOW server_encoding");
  } finally {
    query.mock.restore();
    await repo.close();
  }
});
test("shared PDF text removes NUL separators while preserving originals, page positions and Unicode", () => {
  const original = structuredClone(snapshot);
  original.sources[0].pages[0] = "Basis\0 α ∈ V";
  original.notes[0].text = "A\0 basis spans V";
  const approved = snapshotSchema.parse(original);
  assert.equal(approved.sources[0].pages[0], "Basis α ∈ V");
  assert.equal(approved.notes[0].text, "A basis spans V");
  assert.equal(approved.sources[0].pages.length, 2);
  assert.equal(original.sources[0].pages[0], "Basis\0 α ∈ V");
  assert.throws(() =>
    snapshotSchema.parse({ ...original, notebookId: "bad\0id" }),
  );
});
