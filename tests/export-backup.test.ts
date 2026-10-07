import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFArray, degrees } from "pdf-lib";
import JSZip from "jszip";
import { createBackup, readBackup } from "../src/lib/backup.ts";
import { exportAnnotatedPdf } from "../src/lib/pdf-export.ts";
import type { Source, Annotation } from "../src/types.ts";

async function fixture() {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]);
  pdf.addPage([600, 800]).setRotation(degrees(90));
  const blob = new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  });
  const source: Source = {
    id: "s",
    notebookId: "n",
    name: "Paper.pdf",
    kind: "pdf",
    blob,
    pages: ["first", "second"],
    size: blob.size,
    createdAt: 1,
    bookmarks: [2],
    readingState: { page: 2, mode: "book", zoom: 110, fraction: 0.2 },
  };
  const annotation: Annotation = {
    id: "a",
    sourceId: "s",
    page: 2,
    quote: "A passage",
    note: "日本語 🧠",
    color: "mint",
    kind: "underline",
    rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.03 }],
    createdAt: 1,
    tags: ["important"],
  };
  return { source, annotation };
}
test("complete backup round-trip restores originals, reading preferences, annotations, and conversations with fresh IDs", async () => {
  const { source, annotation } = await fixture();
  const backup = await createBackup({
    notebooks: [
      {
        id: "n",
        title: "Research",
        description: "",
        notes: "Keep this.",
        messages: [
          {
            id: "m",
            role: "assistant",
            content: "Answer [1]",
            citations: [
              {
                id: 1,
                sourceId: "s",
                sourceName: "Paper.pdf",
                page: 2,
                text: "first",
              },
            ],
          },
        ],
        createdAt: 1,
      },
    ],
    sources: [source],
    annotations: [annotation],
    artifacts: [
      {
        id: "cards",
        notebookId: "n",
        kind: "flashcards",
        title: "Review",
        content: "",
        createdAt: 1,
        items: [
          { question: "What matters?", answer: "Attention", citationIds: [1] },
        ],
        citations: [
          {
            id: 1,
            sourceId: "s",
            sourceName: "Paper.pdf",
            page: 2,
            text: "second",
          },
        ],
      },
    ],
  });
  const restored = await readBackup(backup);
  assert.notEqual(restored.notebooks[0].id, "n");
  assert.equal(restored.sources[0].notebookId, restored.notebooks[0].id);
  assert.equal(restored.annotations[0].sourceId, restored.sources[0].id);
  assert.equal(
    restored.notebooks[0].messages[0].citations?.[0].sourceId,
    restored.sources[0].id,
  );
  assert.equal(restored.annotations[0].note, annotation.note);
  assert.deepEqual(restored.sources[0].readingState, source.readingState);
  assert.equal(restored.artifacts[0].notebookId, restored.notebooks[0].id);
  assert.equal(
    restored.artifacts[0].citations[0].sourceId,
    restored.sources[0].id,
  );
  assert.notEqual(restored.artifacts[0].id, "cards");
  assert.deepEqual(
    new Uint8Array(await restored.sources[0].blob.arrayBuffer()),
    new Uint8Array(await source.blob.arrayBuffer()),
  );
});
test("invalid backups fail without partial restore data", async () => {
  const zip = new JSZip();
  zip.file("notebook.json", JSON.stringify({ version: 99 }));
  await assert.rejects(
    readBackup(
      new Blob([
        new Uint8Array(await zip.generateAsync({ type: "uint8array" })),
      ]),
    ),
    /invalid|unsupported/,
  );
});
test("export preserves page rotation and stores Unicode comments as PDF annotations", async () => {
  const { source, annotation } = await fixture();
  const output = await exportAnnotatedPdf(source, [
    annotation,
    {
      ...annotation,
      id: "pen",
      kind: "pen",
      points: [
        { x: 0.1, y: 0.3 },
        { x: 0.3, y: 0.4 },
      ],
    },
  ]);
  const pdf = await PDFDocument.load(await output.arrayBuffer());
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getPage(1).getRotation().angle, 90);
  const annotations = pdf
    .getPage(1)
    .node.lookup(PDFName.of("Annots"), PDFArray);
  assert.equal(annotations.size(), 2);
  assert.match(String(pdf.context.lookup(annotations.get(0))), /Contents/);
});
