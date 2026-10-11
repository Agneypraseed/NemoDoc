import assert from "node:assert/strict";
import test from "node:test";
import { exportNotebookNotes } from "../src/lib/notes-export.ts";
import type { Annotation, Notebook, Source } from "../src/types.ts";

const citation = {
  id: 1,
  sourceId: "book",
  sourceName: "Linear Algebra.pdf",
  page: 53,
  text: "The rank is the number of linearly independent columns.",
};

test("Markdown export includes authored notes without exporting the source or chat history", () => {
  const notebook: Notebook = {
    id: "n1",
    title: "Maths",
    description: "",
    createdAt: 1,
    notes: "My own study notes.",
    messages: [
      { id: "q1", role: "user", content: "What is a basis?" },
      {
        id: "a1",
        role: "assistant",
        content: "A basis is a minimal generating set. [1]",
        citations: [citation],
        savedToNotes: true,
      },
      { id: "q2", role: "user", content: "Unrelated private chat" },
      {
        id: "a2",
        role: "assistant",
        content: "This unsaved chat stays out of the notes file.",
      },
      { id: "p1q", role: "user", content: "Define rank." },
      {
        id: "p1a",
        role: "assistant",
        content: "Rank counts independent columns. [1]",
        citations: [citation],
        savedToNotes: true,
      },
    ],
    passageNotes: [
      {
        id: "p1",
        sourceId: "book",
        page: 53,
        quote: "Rank",
        rects: [],
        question: "Define rank.",
        answerMode: "quick",
        model: "nemotron-test",
        messages: [
          { id: "p1q", role: "user", content: "Define rank." },
          {
            id: "p1a",
            role: "assistant",
            content: "Rank counts independent columns. [1]",
            citations: [citation],
            savedToNotes: true,
          },
        ],
        createdAt: 2,
      },
    ],
  };
  const annotation: Annotation = {
    id: "mark1",
    sourceId: "book",
    page: 53,
    quote: "The rank is the number of linearly independent columns.",
    note: "Review this definition before the exam.",
    color: "yellow",
    rects: [],
    createdAt: 3,
    kind: "highlight",
  };
  const source: Pick<Source, "id" | "name" | "kind"> = {
    id: "book",
    name: "Linear Algebra.pdf",
    kind: "pdf",
  };

  const markdown = exportNotebookNotes(notebook, [annotation], [source]);

  assert.match(markdown, /# Maths/);
  assert.match(markdown, /My own study notes\./);
  assert.match(markdown, /Answers saved to Notes/);
  assert.match(markdown, /What is a basis\?/);
  assert.match(markdown, /A basis is a minimal generating set\. \[1\]/);
  assert.match(markdown, /Passage notes/);
  assert.match(markdown, /Define rank\./);
  assert.match(markdown, /Linear Algebra\.pdf` · Page 53/);
  assert.match(markdown, /Highlights & annotations/);
  assert.match(markdown, /Review this definition before the exam\./);
  assert.doesNotMatch(markdown, /Unrelated private chat/);
  assert.doesNotMatch(markdown, /unsaved chat/);
  // The passage answer appears once under its passage note, not twice as a saved answer.
  assert.equal(
    (markdown.match(/Rank counts independent columns/g) ?? []).length,
    1,
  );
});
