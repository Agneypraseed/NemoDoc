import test from "node:test";
import assert from "node:assert/strict";
import { learningProgress } from "../src/lib/learning-progress.ts";
import {
  localQuizAttemptSchema,
  type LocalQuizAttempt,
} from "../src/study-progress-types.ts";
import { createBackup, readBackup } from "../src/lib/backup.ts";
import type { Notebook, Source, StudyArtifact } from "../src/types.ts";
const source: Source = {
  id: "paper",
  notebookId: "book",
  name: "Book.pdf",
  kind: "pdf",
  blob: new Blob(["fixture"]),
  size: 7,
  pages: ["Evidence", ""],
  createdAt: 1,
};
const attempt: LocalQuizAttempt = {
  id: "attempt",
  notebookId: "book",
  artifactId: "quiz",
  title: "Quiz",
  completedAt: 1,
  answers: [
    {
      question: "Definition?",
      choices: ["Right", "Wrong"],
      selected: 1,
      correct: 0,
      references: [{ sourceId: "paper", page: 1 }],
    },
  ],
};
test("learning review uses latest scoped answers and does not invent mastery", () => {
  const summary = learningProgress(
    "book",
    [
      attempt,
      {
        ...attempt,
        id: "later",
        completedAt: 2,
        answers: [{ ...attempt.answers[0], selected: 0 }],
      },
      { ...attempt, id: "foreign", notebookId: "other", completedAt: 3 },
    ],
    [source],
  );
  assert.equal(summary.history.length, 2);
  assert.equal(summary.missed.length, 0);
  assert.deepEqual(summary.lastScore, { correct: 1, total: 1 });
  assert.deepEqual(summary.focus, []);
});
test("targeted review excludes missing, unreadable and unselected source pages", () => {
  const mixed = {
    ...attempt,
    answers: [
      ...attempt.answers,
      {
        ...attempt.answers[0],
        question: "Removed?",
        references: [{ sourceId: "missing", page: 1 }],
      },
      {
        ...attempt.answers[0],
        question: "Empty?",
        references: [{ sourceId: "paper", page: 2 }],
      },
    ],
  };
  const summary = learningProgress("book", [mixed], [source]);
  assert.equal(summary.missed.length, 3);
  assert.equal(summary.focus.length, 1);
  assert.equal(summary.focus[0].selectedAnswer, "Wrong");
  assert.equal(learningProgress("book", [attempt], []).focus.length, 0);
  assert.equal(
    localQuizAttemptSchema.safeParse({
      ...attempt,
      answers: [{ ...attempt.answers[0], selected: 9 }],
    }).success,
    false,
  );
});
test("quiz history restores notebook, artifact and page links and accepts older backups", async () => {
  const notebook: Notebook = {
    id: "book",
    title: "Book",
    description: "",
    createdAt: 1,
    notes: "Keep my notes",
    messages: [],
    quizAttempts: [attempt],
  };
  const artifact: StudyArtifact = {
    id: "quiz",
    notebookId: "book",
    kind: "quiz",
    title: "Quiz",
    content: "",
    items: [],
    citations: [],
    createdAt: 1,
    focusQuestions: ["Definition?"],
  };
  const restored = await readBackup(
    await createBackup({
      notebooks: [notebook],
      sources: [source],
      artifacts: [artifact],
      annotations: [],
    }),
  );
  const saved = restored.notebooks[0].quizAttempts![0];
  assert.equal(saved.notebookId, restored.notebooks[0].id);
  assert.equal(saved.artifactId, restored.artifacts[0].id);
  assert.equal(saved.answers[0].references[0].sourceId, restored.sources[0].id);
  assert.equal(saved.answers[0].selected, 1);
  assert.deepEqual(restored.artifacts[0].focusQuestions, ["Definition?"]);
  const legacy = await readBackup(
    await createBackup({
      notebooks: [{ ...notebook, quizAttempts: undefined }],
      sources: [source],
      artifacts: [],
      annotations: [],
    }),
  );
  assert.equal(legacy.notebooks[0].quizAttempts, undefined);
  await assert.rejects(
    readBackup(
      await createBackup({
        notebooks: [
          { ...notebook, quizAttempts: [{ ...attempt, notebookId: "other" }] },
        ],
        sources: [source],
        artifacts: [],
        annotations: [],
      }),
    ),
    /another notebook/,
  );
});
