import { usesCitation } from "./citations";
import type { Message, Source } from "../types";

export interface SavedAnswer {
  notes: string;
  messages: Message[];
}

/** Keep locally persisted message metadata when a streaming snapshot arrives. */
export function mergeStreamMessages(current: Message[], streamed: Message[]) {
  return streamed.map((message) => ({
    ...message,
    savedToNotes:
      current.find((candidate) => candidate.id === message.id)?.savedToNotes ??
      message.savedToNotes,
  }));
}

/** Build and append a note from a completed answer, without trusting retrieval
 * candidates that the answer did not actually cite. */
export function saveAnswerToNotes(
  notes: string,
  messages: Message[],
  answerId: string,
  sources: Source[],
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
    "### Question",
    "",
    question.content.trim(),
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
      message.id === answerId ? { ...message, savedToNotes: true } : message,
    ),
  };
}
