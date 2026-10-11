import test from "node:test";
import assert from "node:assert/strict";
import { selectedPageEvidence } from "../server/retrieval.ts";
import { VisibleAnswerStream } from "../server/visible-answer.ts";

const book = {
  id: "book",
  name: "Lecture.pdf",
  pages: [
    "Search-engine rank and unrelated material.",
    "Rank\n The rank of a matrix is the number of linearly independent columns.",
  ],
};
test("one-word selections retain their page's surrounding definition and exact identity", () => {
  const excerpts = selectedPageEvidence([book], {
    sourceId: "book",
    page: 2,
    quote: "Rank",
  });
  assert.equal(excerpts.length, 1);
  assert.equal(excerpts[0].page, 2);
  assert.equal(excerpts[0].sourceId, "book");
  assert.match(excerpts[0].text, /linearly independent columns/);
  assert.doesNotMatch(excerpts[0].text, /Search-engine/);
});
test("selected page evidence handles PDF whitespace and includes context around late selections", () => {
  const page =
    "Unrelated preface. ".repeat(2000) +
    "A matrix Rank\n is its dimension. The definition matters.";
  const excerpts = selectedPageEvidence([{ ...book, pages: [page] }], {
    sourceId: "book",
    page: 1,
    quote: "Rank is",
  });
  assert.match(excerpts[0].text, /Rank is its dimension/);
  assert.ok(excerpts[0].text.length < 10000);
});
test("invalid source, page, forged quote, scan, and duplicate source IDs produce no selected evidence", () => {
  for (const selection of [
    { sourceId: "outside", page: 2, quote: "Rank" },
    { sourceId: "book", page: 3, quote: "Rank" },
    { sourceId: "book", page: 2, quote: "Invented statement" },
  ])
    assert.deepEqual(selectedPageEvidence([book], selection), []);
  assert.deepEqual(
    selectedPageEvidence([book, book], {
      sourceId: "book",
      page: 2,
      quote: "Rank",
    }),
    [],
  );
  assert.deepEqual(
    selectedPageEvidence([{ ...book, pages: [""] }], {
      sourceId: "book",
      page: 1,
      quote: "Rank",
    }),
    [],
  );
});
test("streamed tagged reasoning stays hidden across every token boundary", () => {
  const content =
    "<think>Private planning.</think>Rank is the number of independent columns. [1]";
  for (let split = 1; split < content.length; split++) {
    const stream = new VisibleAnswerStream();
    const answer =
      stream.push(content.slice(0, split)) +
      stream.push(content.slice(split)) +
      stream.finish();
    assert.equal(answer, "Rank is the number of independent columns. [1]");
  }
  const stream = new VisibleAnswerStream();
  assert.equal(
    Array.from(content)
      .map((token) => stream.push(token))
      .join("") + stream.finish(),
    "Rank is the number of independent columns. [1]",
  );
});
test("visible mathematical notation is preserved while unfinished reasoning yields no answer", () => {
  const stream = new VisibleAnswerStream();
  assert.equal(
    stream.push("For x < 3, rank(A) <= n. [1]") + stream.finish(),
    "For x < 3, rank(A) <= n. [1]",
  );
  const hidden = new VisibleAnswerStream();
  assert.equal(hidden.push("<analysis>Never finished") + hidden.finish(), "");
});
