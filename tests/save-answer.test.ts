import test from "node:test";
import assert from "node:assert/strict";
import {
  editNotebookAnswer,
  mergeStreamMessages,
  saveAnswerToNotes,
} from "../src/lib/save-answer.ts";
import type { Message, Source, Notebook } from "../src/types.ts";

const sources = [
  {
    id: "paper",
    notebookId: "notebook",
    name: "Research.pdf",
    kind: "pdf",
    blob: new Blob(),
    pages: ["one", "two"],
    size: 0,
    createdAt: 1,
  },
  {
    id: "slides",
    notebookId: "notebook",
    name: "Lecture.pptx",
    kind: "pptx",
    blob: new Blob(),
    pages: ["one", "two", "three"],
    size: 0,
    createdAt: 1,
  },
] satisfies Source[];

test("appends the question, answer, and only valid cited source pages", () => {
  const messages: Message[] = [
    { id: "q", role: "user", content: "What **matters**?" },
    {
      id: "a",
      role: "assistant",
      content:
        "Attention matters [1, 2] and again [1]. Unknown [9]. Wrong [3, p. 1].",
      citations: [
        {
          id: 1,
          sourceId: "paper",
          sourceName: "Wrong name",
          page: 2,
          text: "",
        },
        {
          id: 2,
          sourceId: "slides",
          sourceName: "Lecture.pptx",
          page: 3,
          text: "",
        },
        {
          id: 3,
          sourceId: "paper",
          sourceName: "Research.pdf",
          page: 2,
          text: "",
        },
        {
          id: 4,
          sourceId: "missing",
          sourceName: "Missing.pdf",
          page: 1,
          text: "",
        },
      ],
    },
  ];
  const saved = saveAnswerToNotes("Existing *notes*.", messages, "a", sources)!;
  assert.match(saved.notes, /^Existing \*notes\*\./);
  assert.match(saved.notes, /What \*\*matters\*\*\?/);
  assert.match(saved.notes, /Attention matters \[1, 2\]/);
  assert.match(saved.notes, /Research\.pdf — page 2/);
  assert.match(saved.notes, /Lecture\.pptx — slide 3/);
  assert.equal((saved.notes.match(/Research\.pdf — page 2/g) ?? []).length, 1);
  assert.doesNotMatch(saved.notes, /Missing\.pdf/);
  assert.equal(saved.messages[1].savedToNotes, true);
  assert.equal(
    saveAnswerToNotes(saved.notes, saved.messages, "a", sources),
    undefined,
  );
});

test("older rewritten questions save the user's original wording", () => {
  const messages: Message[] = [
    {
      id: "q",
      role: "user",
      content: "Expanded model request",
      originalPrompt: "My own question?",
    },
    { id: "a", role: "assistant", content: "A completed answer." },
  ];
  const saved = saveAnswerToNotes("", messages, "a", sources)!;
  assert.match(saved.notes, /My own question\?/);
  assert.doesNotMatch(saved.notes, /Expanded model request/);
});

test("rejects empty answers and answers without an associated question", () => {
  assert.equal(
    saveAnswerToNotes(
      "",
      [{ id: "a", role: "assistant", content: "" }],
      "a",
      sources,
    ),
    undefined,
  );
  assert.equal(
    saveAnswerToNotes(
      "",
      [{ id: "a", role: "assistant", content: "Answer" }],
      "a",
      sources,
    ),
    undefined,
  );
});

test("stream updates preserve the saved state of an earlier answer", () => {
  const current: Message[] = [
    { id: "old", role: "assistant", content: "Old", savedToNotes: true },
    {
      id: "question",
      role: "user",
      content: "Explain the basis definition concisely.",
      originalPrompt: "Could you explain what a basis is?",
    },
    { id: "new", role: "assistant", content: "Part" },
  ];
  const merged = mergeStreamMessages(current, [
    { id: "old", role: "assistant", content: "Old" },
    {
      id: "question",
      role: "user",
      content: "Explain the basis definition concisely.",
    },
    { id: "new", role: "assistant", content: "Partial answer" },
  ]);
  assert.equal(merged[0].savedToNotes, true);
  assert.equal(merged[1].originalPrompt, "Could you explain what a basis is?");
  assert.equal(merged[2].content, "Partial answer");
});

test("unfinished answers and invalid source pages cannot become saved evidence", () => {
  const messages: Message[] = [
    { id: "q", role: "user", content: "Question" },
    { id: "a", role: "assistant", content: "Partial [1]", incomplete: true },
  ];
  assert.equal(saveAnswerToNotes("", messages, "a", sources), undefined);
  messages[1].incomplete = false;
  messages[1].content = "Answer [1] [2] [3] [4]";
  messages[1].citations = [0, -1, 1.5, 99].map((page, index) => ({
    id: index + 1,
    sourceId: "paper",
    sourceName: "Research.pdf",
    page,
    text: "",
  }));
  assert.doesNotMatch(
    saveAnswerToNotes("", messages, "a", sources)!.notes,
    /### Sources/,
  );
});

const editMessages: Message[] = [
  { id: "q", role: "user", content: "Explain attention" },
  {
    id: "a",
    role: "assistant",
    content: "Original words [1].",
    citations: [
      {
        id: 1,
        sourceId: "paper",
        sourceName: "Research.pdf",
        page: 1,
        text: "Original evidence",
      },
    ],
  },
];
function savedNotebook(): Notebook {
  const saved = saveAnswerToNotes("My own notes", editMessages, "a", sources)!;
  return {
    id: "notebook",
    title: "Book",
    description: "",
    createdAt: 1,
    ...saved,
  };
}
test("editing a saved answer updates only its appended block and survives stale streaming snapshots", () => {
  const notebook = savedNotebook();
  const changed = editNotebookAnswer(
    notebook,
    "a",
    "Revised words [1].",
    sources,
  )!;
  assert.equal(changed.noteUpdated, true);
  assert.match(changed.notebook.notes, /My own notes/);
  assert.match(changed.notebook.notes, /Revised words/);
  assert.doesNotMatch(changed.notebook.notes, /Original words/);
  assert.deepEqual(
    changed.notebook.messages[1].citations,
    editMessages[1].citations,
  );
  const merged = mergeStreamMessages(changed.notebook.messages, [
    ...editMessages,
    {
      id: "stream",
      role: "assistant",
      content: "New partial",
      incomplete: true,
    },
  ]);
  assert.equal(merged[1].content, "Revised words [1].");
  assert.equal(merged[1].savedToNotes, true);
  assert.equal(merged[1].editedAt, changed.notebook.messages[1].editedAt);
});
test("editing preserves a separately changed notebook copy and updates duplicate passage messages", () => {
  const notebook = savedNotebook();
  notebook.notes = notebook.notes.replace(
    "Original words",
    "My separate revision",
  );
  notebook.passageNotes = [
    {
      id: "passage",
      sourceId: "paper",
      page: 1,
      quote: "Original evidence",
      rects: [],
      question: "Explain attention",
      answerMode: "quick",
      model: "fixture",
      createdAt: 1,
      messages: notebook.messages,
    },
  ];
  const changed = editNotebookAnswer(
    notebook,
    "a",
    "New answer [1].",
    sources,
  )!;
  assert.equal(changed.noteUpdated, false);
  assert.equal(changed.notebook.notes, notebook.notes);
  assert.equal(
    changed.notebook.passageNotes![0].messages[1].content,
    "New answer [1].",
  );
  assert.equal(editNotebookAnswer(notebook, "a", "  ", sources), undefined);
  assert.equal(
    editNotebookAnswer(
      {
        ...notebook,
        messages: [{ ...notebook.messages[1], incomplete: true }],
      },
      "a",
      "Edits",
      sources,
    ),
    undefined,
  );
});
test("edited-answer metadata survives backup restore and legacy saved answers can be edited", async () => {
  const { createBackup, readBackup } = await import("../src/lib/backup.ts");
  const notebook = savedNotebook();
  delete notebook.messages[1].savedNoteText;
  const changed = editNotebookAnswer(
    notebook,
    "a",
    "Edited legacy answer [1].",
    sources,
  )!.notebook;
  assert.match(changed.notes, /Edited legacy answer/);
  const restored = await readBackup(
    await createBackup({
      notebooks: [changed],
      sources,
      annotations: [],
      artifacts: [],
    }),
  );
  assert.equal(
    restored.notebooks[0].messages[1].editedAt,
    changed.messages[1].editedAt,
  );
  assert.equal(
    restored.notebooks[0].messages[1].savedNoteText,
    changed.messages[1].savedNoteText,
  );
});
