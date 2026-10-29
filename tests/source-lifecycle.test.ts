import test from "node:test";
import assert from "node:assert/strict";
import {
  preserveSourceNotes,
  restoreSourceNotes,
} from "../src/lib/source-notes.ts";
import { exportStudyMaterial, studyEvidence } from "../src/lib/study-export.ts";
import { exportNotebookNotes } from "../src/lib/notes-export.ts";
import { createBackup, readBackup } from "../src/lib/backup.ts";
import type {
  Annotation,
  Notebook,
  PassageNote,
  Source,
  StudyArtifact,
} from "../src/types.ts";
const source: Source = {
  id: "paper",
  notebookId: "book",
  name: "Book.pdf",
  kind: "pdf",
  blob: new Blob(["fixture"]),
  size: 7,
  pages: ["Evidence one", "Evidence two"],
  createdAt: 1,
};
const messages: Notebook["messages"] = [
  { id: "q", role: "user", content: "Explain this" },
  {
    id: "a",
    role: "assistant",
    content: "Edited explanation [1].",
    editedAt: 2,
    citations: [
      {
        id: 1,
        sourceId: "paper",
        sourceName: "Book.pdf",
        page: 1,
        text: "Evidence one",
      },
    ],
  },
];
const passage: PassageNote = {
  id: "note",
  sourceId: "paper",
  page: 1,
  quote: "My selected passage",
  rects: [],
  question: "Explain this",
  answerMode: "quick",
  model: "fixture",
  createdAt: 1,
  messages,
};
const notebook: Notebook = {
  id: "book",
  title: "Book",
  description: "",
  createdAt: 1,
  notes: "My original notes  \n",
  messages,
  passageNotes: [passage],
};
const annotation: Annotation = {
  id: "highlight",
  sourceId: "paper",
  page: 2,
  quote: "My quote",
  note: "My own comment: 学習",
  tags: ["review"],
  color: "mint",
  rects: [],
  createdAt: 1,
};
test("source removal preserves authored content and produces a backup without orphaned passage records", async () => {
  const kept = preserveSourceNotes(notebook, source, [annotation]);
  assert.ok(kept.notebook.notes.startsWith(notebook.notes));
  assert.match(kept.notebook.notes, /My selected passage/);
  assert.match(kept.notebook.notes, /Edited explanation/);
  assert.match(kept.notebook.notes, /学習/);
  assert.match(kept.notebook.notes, /review/);
  assert.equal(kept.notebook.passageNotes!.length, 0);
  assert.deepEqual(kept.notebook.messages, notebook.messages);
  const restored = await readBackup(
    await createBackup({
      notebooks: [kept.notebook],
      sources: [],
      annotations: [],
      artifacts: [],
    }),
  );
  assert.match(restored.notebooks[0].notes, /My own comment/);
  assert.equal(restored.sources.length, 0);
  assert.equal(
    preserveSourceNotes({ ...notebook, id: "other" }, source, [annotation])
      .block,
    "",
  );
});
test("undo removes only an unchanged preservation block and retains newer answer edits", () => {
  const kept = preserveSourceNotes(notebook, source, [annotation]);
  const later = {
    ...kept.notebook,
    messages: messages.map((m) =>
      m.id === "a" ? { ...m, content: "Newer edited answer", editedAt: 3 } : m,
    ),
  };
  const restored = restoreSourceNotes(later, kept.passages, kept.block);
  assert.equal(restored.notes, notebook.notes);
  assert.equal(
    restored.passageNotes![0].messages[1].content,
    "Newer edited answer",
  );
  const altered = {
    ...kept.notebook,
    notes: kept.notebook.notes.replace("My own comment", "Changed archive"),
  };
  assert.match(
    restoreSourceNotes(altered, kept.passages, kept.block).notes,
    /Changed archive/,
  );
});
const guide: StudyArtifact = {
  id: "guide",
  notebookId: "book",
  kind: "guide",
  title: "Guide",
  content: "Supported [1]. Missing [3]. Unknown [99].",
  focusQuestions: ["Review this topic"],
  items: [],
  createdAt: 1,
  citations: [
    { id: 1, sourceId: "paper", sourceName: "Book.pdf", page: 1, text: "one" },
    {
      id: 2,
      sourceId: "paper",
      sourceName: "Uncited candidate",
      page: 2,
      text: "two",
    },
    {
      id: 3,
      sourceId: "paper",
      sourceName: "Missing page",
      page: 9,
      text: "old",
    },
  ],
};
test("study exports include only cited available evidence and label unavailable pages", () => {
  assert.deepEqual(
    studyEvidence(guide, [source]).map((c) => c.id),
    [1],
  );
  const text = exportStudyMaterial(guide, [source]);
  assert.match(text, /Personalized review focus/);
  assert.match(text, /Book.pdf, page 1/);
  assert.doesNotMatch(text, /Uncited candidate/);
  assert.match(text, /Missing page, page 9 \(source page unavailable\)/);
  const cards = {
    ...guide,
    kind: "flashcards" as const,
    content: "",
    items: [{ question: "Prompt", answer: "Answer", citationIds: [2] }],
  };
  const json = JSON.parse(exportStudyMaterial(cards, [source]));
  assert.deepEqual(
    json.citations.map((c: { id: number }) => c.id),
    [2],
  );
  assert.equal(
    studyEvidence(guide, [{ ...source, notebookId: "foreign" }]).length,
    0,
  );
});
test("removed source citations are explicitly unavailable in exported saved answers", () => {
  const text = exportNotebookNotes(
    {
      ...notebook,
      notes: "",
      passageNotes: [],
      messages: messages.map((m) => ({
        ...m,
        savedToNotes: m.role === "assistant",
      })),
    },
    [],
    [],
  );
  assert.match(text, /Unavailable source references/);
  assert.doesNotMatch(text, /\*\*Sources:\*\*/);
});
