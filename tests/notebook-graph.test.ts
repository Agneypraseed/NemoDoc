import test from "node:test";
import assert from "node:assert/strict";
import { buildNotebookGraph } from "../src/lib/notebook-graph.ts";
import type { Source, StudyArtifact } from "../src/types.ts";
const source: Source = {
  id: "paper",
  notebookId: "book",
  name: "Paper",
  kind: "pdf",
  blob: new Blob(),
  pages: ["First page", "", "Third page"],
  size: 0,
  createdAt: 1,
};
test("notebook graph derives source links only from valid local recorded references", () => {
  const graph = buildNotebookGraph(
    "book",
    "Book",
    [source, { ...source, id: "foreign", notebookId: "other" }],
    [
      {
        id: "note",
        title: "Cited note",
        text: "Note",
        kind: "highlight",
        references: [
          { sourceId: "paper", page: 3 },
          { sourceId: "paper", page: 2 },
          { sourceId: "paper", page: 99 },
          { sourceId: "foreign", page: 1 },
        ],
      },
    ],
    [],
  );
  assert.equal(graph.nodes.length, 3);
  assert.deepEqual(
    graph.nodes
      .find((n) => n.id === "note:note")!
      .references.map((r) => r.page),
    [3],
  );
  assert.deepEqual(graph.edges, [
    { from: "notebook", to: "source:paper", kind: "contains" },
    { from: "source:paper", to: "note:note", kind: "references" },
  ]);
});
test("graph shows unlinked notes as notebook members and excludes uncited retrieval candidates", () => {
  const artifact: StudyArtifact = {
    id: "guide",
    notebookId: "book",
    kind: "guide",
    title: "Guide",
    content: "A claim [1].",
    items: [],
    citations: [
      {
        id: 1,
        sourceId: "paper",
        sourceName: "Paper",
        page: 1,
        text: "First page",
      },
      {
        id: 2,
        sourceId: "paper",
        sourceName: "Paper",
        page: 3,
        text: "Third page",
      },
    ],
    createdAt: 1,
  };
  const graph = buildNotebookGraph(
    "book",
    "Book",
    [source],
    [{ id: "scratch", title: "Scratch", text: "Ideas", kind: "notebook" }],
    [artifact, { ...artifact, id: "other", notebookId: "other" }],
  );
  assert.deepEqual(
    graph.nodes
      .find((n) => n.id === "study:guide")!
      .references.map((r) => r.page),
    [1],
  );
  assert.ok(
    graph.edges.some(
      (e) =>
        e.from === "notebook" &&
        e.to === "note:scratch" &&
        e.kind === "contains",
    ),
  );
  assert.ok(!graph.nodes.some((n) => n.id === "study:other"));
});
