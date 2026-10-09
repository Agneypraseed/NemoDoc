import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCitations,
  citationMarkdown,
  usesCitation,
} from "../src/lib/citations.ts";
const citations = [
  { id: 2, page: 323, sourceId: "book", sourceName: "MML.pdf", text: "PCA" },
  { id: 3, page: 323, sourceId: "book", sourceName: "MML.pdf", text: "PCA" },
  {
    id: 4,
    page: 326,
    sourceId: "book",
    sourceName: "MML.pdf",
    text: "Variance",
  },
];
test("live Nemotron page-qualified and grouped citations resolve only to matching evidence", () => {
  assert.equal(
    normalizeCitations("PCA [2, p.323] and variance [4, p.326].", citations),
    "PCA [2] and variance [4].",
  );
  assert.equal(
    normalizeCitations("Evidence [2, 3, page 323] [2,4] [3;4]", citations),
    "Evidence [2] [3] [2] [4] [3] [4]",
  );
  assert.equal(
    citationMarkdown("PCA [2, p.323]", citations),
    "PCA [2](#citation-2)",
  );
  assert.equal(usesCitation("PCA [2, p.323]", citations[0], citations), true);
  assert.equal(usesCitation("PCA [2, p.999]", citations[0], citations), false);
  assert.equal(
    normalizeCitations("Wrong [2, p.999] [2,999] [999, p.323]", citations),
    "Wrong [2, p.999] [2,999] [999, p.323]",
  );
  assert.equal(
    citationMarkdown("External [2](https://example.com)", citations),
    "External [2](https://example.com)",
  );
  assert.equal(
    usesCitation("External [2](https://example.com)", citations[0], citations),
    false,
  );
});
