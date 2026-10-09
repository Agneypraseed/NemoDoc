import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeStreamMessages,
  saveAnswerToNotes,
} from "../src/lib/save-answer.ts";
import type { Message, Source } from "../src/types.ts";

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
    { id: "new", role: "assistant", content: "Part" },
  ];
  const merged = mergeStreamMessages(current, [
    { id: "old", role: "assistant", content: "Old" },
    { id: "new", role: "assistant", content: "Partial answer" },
  ]);
  assert.equal(merged[0].savedToNotes, true);
  assert.equal(merged[1].content, "Partial answer");
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
