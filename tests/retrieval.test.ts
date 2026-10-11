import test from "node:test";
import assert from "node:assert/strict";
import { retrieve, selectedPageEvidence } from "../server/retrieval.ts";

test("selected math text matches equivalent PDF superscript and TeX spacing", () => {
  const source = {
    id: "linear-algebra",
    name: "Linear algebra.pdf",
    pages: ["The solution is A^T x=b, when A is invertible."],
  };
  const evidence = selectedPageEvidence([source], {
    sourceId: source.id,
    page: 1,
    quote: "Aᵀ x = b",
  });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].page, 1);
  assert.equal(evidence[0].text, source.pages[0]);
});

test("selected passage matching still rejects text absent from the requested page", () => {
  assert.deepEqual(
    selectedPageEvidence(
      [
        {
          id: "book",
          name: "Book.pdf",
          pages: ["A^T x=b", "A different page."],
        },
      ],
      { sourceId: "book", page: 2, quote: "Aᵀ x = b" },
    ),
    [],
  );
});

test("retrieval ranks relevant passages and preserves source / page identity", () => {
  const sources = [
    {
      id: "one",
      name: "Research.pdf",
      pages: [
        "A small garden has flowers.",
        "Quantum entanglement connects quantum particles.",
      ],
    },
    {
      id: "two",
      name: "Slides.pptx",
      pages: ["Quantum entanglement is a useful example."],
    },
  ];
  const found = retrieve(sources, "Explain quantum entanglement");
  assert.equal(found.length, 2);
  assert.deepEqual(
    found.map((c) => [c.sourceId, c.page, c.id]),
    [
      ["one", 2, 1],
      ["two", 1, 2],
    ],
  );
});
test("overview questions sample across the whole document", () => {
  const found = retrieve(
    [
      {
        id: "book",
        name: "Book.pdf",
        pages: Array.from(
          { length: 100 },
          (_, i) => `Chapter ${i}: A new idea to read.`,
        ),
      },
    ],
    "Summarize the key ideas",
    10,
  );
  assert.equal(found.length, 10);
  assert.ok(found.some((c) => c.page >= 90));
  assert.equal(new Set(found.map((c) => c.page)).size, 10);
});
test("empty scanned pages produce no unsupported excerpts", () => {
  assert.deepEqual(
    retrieve(
      [{ id: "scan", name: "Scan.pdf", pages: ["", "   "] }],
      "What is this about?",
    ),
    [],
  );
});
test("retrieval never includes a source that was not supplied", () => {
  const found = retrieve(
    [{ id: "allowed", name: "Allowed.pdf", pages: ["An allowed fact."] }],
    "fact",
  );
  assert.ok(found.every((c) => c.sourceId === "allowed"));
});
