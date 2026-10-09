import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  explicitPage,
  supportingPages,
  wantsPages,
} from "../src/lib/supporting-pages.ts";
import { singlePagePdf } from "../src/lib/page-export.ts";
import { createBackup, readBackup } from "../src/lib/backup.ts";
import type { Source, Message } from "../src/types.ts";
const source: Source = {
  id: "s",
  notebookId: "n",
  name: "Research.pdf",
  kind: "pdf",
  pages: [
    "Introduction",
    "Retrieval practice improves recall. More evidence.",
    "Conclusion",
  ],
  blob: new Blob(),
  size: 0,
  createdAt: 0,
};
test("explicit requests validate bounds and source ambiguity", () => {
  assert.equal(explicitPage("Show page 2", [source])?.page, 2);
  assert.throws(() => explicitPage("Show page 4", [source]), /has 3/);
  assert.throws(
    () =>
      explicitPage("Show page 2", [
        source,
        { ...source, id: "other", name: "Other.pdf" },
      ]),
    /Choose one/,
  );
  assert.equal(
    explicitPage("Show page 2 from Research.pdf", [
      source,
      { ...source, id: "other", name: "Other.pdf" },
    ])?.sourceId,
    "s",
  );
  assert.ok(wantsPages("Return just the page about retrieval"));
});
test("supporting excerpts deduplicate, reject mismatches and preserve unavailable references", () => {
  const c = {
    id: 1,
    sourceId: "s",
    sourceName: source.name,
    page: 2,
    text: "Retrieval practice improves recall.",
  };
  const m: Message = {
    id: "m",
    role: "assistant",
    content: "Answer [1] [2]",
    citations: [
      c,
      { ...c, id: 2, text: "More evidence." },
      { ...c, id: 3, page: 1 },
    ],
  };
  assert.equal(supportingPages(m, [source]).length, 1);
  assert.equal(supportingPages(m, [source])[0].excerpts.length, 2);
  assert.match(supportingPages(m, [])[0].error!, /unavailable/);
  assert.match(
    supportingPages({ ...m, citations: [{ ...c, text: "fabricated" }] }, [
      source,
    ])[0].error!,
    /does not match/,
  );
});
test("download copies exactly the requested original page", async () => {
  const doc = await PDFDocument.create();
  for (const width of [301, 402, 503])
    doc.addPage([width, 600]).drawText(`Original page ${width}`);
  const blob = new Blob([new Uint8Array(await doc.save())]);
  const output = await PDFDocument.load(
    await (await singlePagePdf({ ...source, blob }, 2)).arrayBuffer(),
  );
  assert.equal(output.getPageCount(), 1);
  assert.equal(output.getPage(0).getWidth(), 402);
  assert.throws(() => explicitPage("Show page 0", [source]));
});
test("backup restores preview references without duplicating images", async () => {
  const library = {
    notebooks: [
      {
        id: "n",
        title: "Test",
        description: "",
        createdAt: 0,
        notes: "",
        messages: [
          {
            id: "m",
            role: "assistant" as const,
            content: "Page [1]",
            showPages: true,
            citations: [
              {
                id: 1,
                sourceId: "s",
                sourceName: source.name,
                page: 2,
                text: source.pages[1],
              },
            ],
          },
        ],
      },
    ],
    sources: [source],
    annotations: [],
    artifacts: [],
  };
  const restored = await readBackup(await createBackup(library));
  assert.equal(restored.notebooks[0].messages[0].showPages, true);
  assert.equal(
    supportingPages(restored.notebooks[0].messages[0], restored.sources).length,
    1,
  );
});
test("page requests never substitute unrelated keyword fallback", async () => {
  const { retrieve } = await import("../server/retrieval.ts");
  assert.deepEqual(
    retrieve(
      [
        {
          id: "s",
          name: "Research.pdf",
          pages: ["Retrieval practice improves recall."],
        },
      ],
      "quasar spectroscopy",
      10,
      false,
    ),
    [],
  );
});
