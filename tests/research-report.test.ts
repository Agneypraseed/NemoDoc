import test from "node:test";
import assert from "node:assert/strict";
import type { Notebook, Source } from "../src/types.ts";
import type { WorkflowRun } from "../src/workspace-types.ts";
import {
  researchReportMarkdown,
  saveResearchToNotes,
} from "../src/lib/research-report.ts";
import { createBackup, readBackup } from "../src/lib/backup.ts";
import { citationIssues } from "../src/lib/citations.ts";

const notebook: Notebook = {
  id: "book",
  title: "Research notebook",
  description: "",
  createdAt: 1,
  notes: "Existing edited notes.",
  messages: [
    {
      id: "stream",
      role: "assistant",
      content: "Partial answer",
      incomplete: true,
    },
  ],
};
const source: Source = {
  id: "mml",
  notebookId: "book",
  name: "Book.pdf",
  kind: "pdf",
  pages: ["Actual page one", "Page two"],
  blob: new Blob(["fixture"], { type: "application/pdf" }),
  createdAt: 1,
  size: 7,
};
const run: WorkflowRun = {
  id: "run-1",
  notebookId: "book",
  workflow: "research_team",
  prompt: "Explain PCA and its limits",
  sourceIds: ["mml"],
  noteIds: [],
  includeProgress: false,
  status: "completed",
  snapshotRevision: "fixture",
  connection: {
    mode: "notebook",
    model: "nemotron",
    baseUrl: "https://example.test/v1",
    configurationRevision: "fixture",
  },
  createdAt: 1,
  calls: 4,
  steps: [],
  evidence: [],
  answer:
    "Original passage [1]. Web finding [3]. Unknown [99]. Wrong page [2, p. 1].",
  citations: [
    {
      id: 1,
      sourceId: "mml",
      sourceName: "Book.pdf",
      page: 1,
      text: "Actual page one",
    },
    {
      id: 2,
      sourceId: "mml",
      sourceName: "Book.pdf",
      page: 2,
      text: "Uncited page two",
    },
  ],
  webEvidence: [
    {
      id: 3,
      url: "https://example.com/research",
      title: "Extracted source",
      text: "Extracted original content",
      retrievedAt: 1,
    },
  ],
  researchTeam: [
    {
      id: "agent",
      name: "Researcher",
      focus: "Read original",
      status: "completed",
      stage: "completed",
      assignedModel: "nemotron-model",
      answer: "Original [1].",
      citationIds: [1],
    },
  ],
};

test("citation diagnostics identify wrong pages and unknown/web references without correcting them", () => {
  const evidence = [{ id: 1, page: 88 }, { id: 4, page: 350 }, { id: 5 }];
  assert.deepEqual(
    citationIssues(
      "Wrong [1, p.350]. Correct [4, p.350]. Web [5, p.1]. Unknown [99].",
      evidence,
    ),
    [
      "Citation [1] is PDF page 88, not page 350.",
      "Citation [5] is web evidence and cannot have a PDF page qualifier.",
      "Citation [99] was not retrieved.",
    ],
  );
});

test("save research appends question, report and cited evidence while preserving existing notes and streaming metadata", () => {
  const saved = saveResearchToNotes(notebook, run, [source])!;
  assert.ok(saved.notes.startsWith(notebook.notes));
  assert.match(saved.notes, /Explain PCA/);
  assert.match(saved.notes, /Actual page one/);
  assert.match(saved.notes, /Extracted original content/);
  assert.match(saved.notes, /retrieved/);
  assert.ok(!saved.notes.includes("Uncited page two"));
  assert.deepEqual(saved.messages, notebook.messages);
  assert.deepEqual(saved.savedResearchRuns, ["run-1"]);
  assert.equal(saveResearchToNotes(saved, run, [source]), undefined);
  assert.equal(
    saveResearchToNotes(notebook, { ...run, notebookId: "another" }, [source]),
    undefined,
  );
  assert.equal(
    saveResearchToNotes(notebook, { ...run, status: "running" }, [source]),
    undefined,
  );
  assert.equal(
    saveResearchToNotes(notebook, { ...run, answer: "" }, [source]),
    undefined,
  );
  assert.ok(
    !saveResearchToNotes(notebook, run, [])!.notes.includes("Actual page one"),
  );
});

test("failed report exports preserve completed findings without presenting a successful synthesis", () => {
  const markdown = researchReportMarkdown(
    {
      ...run,
      status: "failed",
      error: "Reviewer unavailable",
      answer: "Unfinished synthesis",
    },
    true,
  );
  assert.match(markdown, /Partial findings/);
  assert.match(markdown, /Reviewer unavailable/);
  assert.match(markdown, /Original \[1\]/);
  assert.ok(!markdown.includes("Unfinished synthesis"));
});

test("research save state and notes survive ZIP backup and older notebooks remain compatible", async () => {
  const saved = saveResearchToNotes(notebook, run, [source])!;
  const restored = await readBackup(
    await createBackup({
      notebooks: [saved],
      sources: [source],
      annotations: [],
      artifacts: [],
    }),
  );
  assert.equal(restored.notebooks[0].notes, saved.notes);
  assert.deepEqual(restored.notebooks[0].savedResearchRuns, [run.id]);
  assert.equal(
    saveResearchToNotes(restored.notebooks[0], run, restored.sources),
    undefined,
  );
  const old = await readBackup(
    await createBackup({
      notebooks: [notebook],
      sources: [source],
      annotations: [],
      artifacts: [],
    }),
  );
  assert.equal(old.notebooks[0].savedResearchRuns, undefined);
});
