import { usesCitation } from "./citations";
import type { Message, Source, PassageNote, Notebook } from "../types";

export interface SavedAnswer {
  notes: string;
  messages: Message[];
}

/** Keep locally persisted message metadata when a streaming snapshot arrives. */
export function mergeStreamMessages(current: Message[], streamed: Message[]) {
  return streamed.map((message) => {
    const existing = current.find((candidate) => candidate.id === message.id);
    return {
      ...message,
      ...(existing?.editedAt && existing.editedAt >= (message.editedAt ?? 0)
        ? { content: existing.content, editedAt: existing.editedAt }
        : {}),
      savedNoteText: existing?.savedNoteText ?? message.savedNoteText,
      savedToNotes: existing?.savedToNotes ?? message.savedToNotes,
      originalPrompt: existing?.originalPrompt ?? message.originalPrompt,
      savedAt: existing?.savedAt ?? message.savedAt,
    };
  });
}

/** Build and append a note from a completed answer, without trusting retrieval
 * candidates that the answer did not actually cite. */
export function saveAnswerToNotes(
  notes: string,
  messages: Message[],
  answerId: string,
  sources: Source[],
  passage?: PassageNote,
): SavedAnswer | undefined {
  const answerIndex = messages.findIndex((message) => message.id === answerId);
  const answer = messages[answerIndex];
  if (
    !answer ||
    answer.role !== "assistant" ||
    !answer.content.trim() ||
    answer.incomplete ||
    answer.savedToNotes
  )
    return;

  const question = messages
    .slice(0, answerIndex)
    .reverse()
    .find((message) => message.role === "user" && message.content.trim());
  if (!question) return;

  const cited = (answer.citations ?? []).filter((citation) => {
    const source = sources.find(
      (candidate) => candidate.id === citation.sourceId,
    );
    return (
      !!source &&
      Number.isInteger(citation.page) &&
      citation.page >= 1 &&
      citation.page <= source.pages.length &&
      usesCitation(answer.content, citation, answer.citations ?? [])
    );
  });
  const unique = cited.filter(
    (citation, index) =>
      cited.findIndex(
        (candidate) =>
          candidate.sourceId === citation.sourceId &&
          candidate.page === citation.page,
      ) === index,
  );
  const sourceLines = unique.map((citation) => {
    const source = sources.find(
      (candidate) => candidate.id === citation.sourceId,
    )!;
    return `- ${source.name} — ${source.kind === "pptx" ? "slide" : "page"} ${citation.page}`;
  });
  const section = [
    "## Saved answer",
    "",
    ...(passage
      ? [
          "### Cited passage",
          "",
          ...passage.quote
            .trim()
            .split(/\r?\n/)
            .map((line) => `> ${line}`),
          "",
        ]
      : []),
    "### Question",
    "",
    (question.originalPrompt ?? question.content).trim(),
    "",
    "### Answer",
    "",
    answer.content.trim(),
    ...(sourceLines.length ? ["", "### Sources", "", ...sourceLines] : []),
  ].join("\n");

  return {
    notes: notes.trimEnd()
      ? `${notes.trimEnd()}\n\n${section}\n`
      : `${section}\n`,
    messages: messages.map((message) =>
      message.id === answerId
        ? {
            ...message,
            savedToNotes: true,
            savedAt: Date.now(),
            savedNoteText: section,
          }
        : message,
    ),
  };
}

/** Update the canonical answer and its passage copy. Replace an appended note only
 * when its exact saved snapshot still exists uniquely; preserve separate note edits. */
export function editNotebookAnswer(
  notebook: Notebook,
  answerId: string,
  content: string,
  sources: Source[],
) {
  const answer = notebook.messages.find((m) => m.id === answerId);
  if (
    !answer ||
    answer.role !== "assistant" ||
    answer.incomplete ||
    answer.cancelled ||
    !content.trim()
  )
    return;
  const passage = notebook.passageNotes?.find((n) =>
    n.messages.some((m) => m.id === answerId),
  );
  const localSources = sources.filter((s) => s.notebookId === notebook.id);
  const sectionFor = (text: string) =>
    saveAnswerToNotes(
      "",
      notebook.messages.map((m) =>
        m.id === answerId ? { ...m, content: text, savedToNotes: false } : m,
      ),
      answerId,
      localSources,
      passage,
    )?.messages.find((m) => m.id === answerId)?.savedNoteText;
  const oldSection = answer.savedNoteText ?? sectionFor(answer.content);
  const newSection = sectionFor(content);
  const index = oldSection ? notebook.notes.indexOf(oldSection) : -1;
  const noteUpdated = !!(
    answer.savedToNotes &&
    oldSection &&
    newSection &&
    index >= 0 &&
    index === notebook.notes.lastIndexOf(oldSection)
  );
  const editedAt = Date.now();
  const update = (m: Message): Message =>
    m.id === answerId
      ? {
          ...m,
          content,
          editedAt,
          ...(answer.savedToNotes && oldSection
            ? { savedNoteText: noteUpdated ? newSection : oldSection }
            : {}),
        }
      : m;
  return {
    noteUpdated,
    notebook: {
      ...notebook,
      ...(noteUpdated
        ? {
            notes:
              notebook.notes.slice(0, index) +
              newSection +
              notebook.notes.slice(index + oldSection!.length),
            notesUpdatedAt: editedAt,
          }
        : {}),
      messages: notebook.messages.map(update),
      passageNotes: notebook.passageNotes?.map((n) => ({
        ...n,
        messages: n.messages.map(update),
      })),
    },
  };
}
