import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSchema } from "../src/workspace-types.ts";
import { snapshot } from "./fixtures/evidence-workspace.ts";
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
