import type { Annotation, Notebook } from "../types";
import { passageTitle } from "./passage-label";

export interface SearchNote {
  id: string;
  title: string;
  text: string;
  kind: "answer" | "passage" | "highlight" | "notebook";
}

/** Search a fresh snapshot of local notes; never store private notes on the server. */
export function searchableNotes(
  notebook: Notebook,
  annotations: Annotation[],
): SearchNote[] {
  const result: SearchNote[] = [];
  if (notebook.notes.trim())
    result.push({
      id: notebook.id,
      title: "Notebook notes",
      text: notebook.notes,
      kind: "notebook",
    });
  const passageIds = new Set<string>();
  for (const note of notebook.passageNotes ?? []) {
    note.messages.forEach((message) => passageIds.add(message.id));
    const answers = note.messages.filter(
      (message) =>
        message.role === "assistant" &&
        !message.incomplete &&
        !message.cancelled &&
        message.content.trim(),
    );
    if (answers.length)
      result.push({
        id: note.id,
        title: passageTitle(note.question, note.quote),
        text: [
          note.quote,
          note.question,
          ...answers.map((answer) => answer.content),
        ].join("\n\n"),
        kind: "passage",
      });
  }
  notebook.messages.forEach((message, index) => {
    if (
      message.role !== "assistant" ||
      !message.savedToNotes ||
      message.incomplete ||
      message.cancelled ||
      !message.content.trim() ||
      passageIds.has(message.id)
    )
      return;
    const question =
      notebook.messages
        .slice(0, index)
        .reverse()
        .find((item) => item.role === "user")?.content ?? "Saved answer";
    result.push({
      id: message.id,
      title: question,
      text: `${question}\n\n${message.content}`,
      kind: "answer",
    });
  });
  for (const annotation of annotations) {
    const text = [annotation.quote, annotation.note, ...(annotation.tags ?? [])]
      .filter(Boolean)
      .join("\n");
    if (text.trim())
      result.push({
        id: annotation.id,
        title: annotation.quote || "Annotation",
        text,
        kind: "highlight",
      });
  }
  return result;
}
