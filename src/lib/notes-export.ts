import { usesCitation } from "./citations";
import { passageTitle } from "./passage-label";
import type {
  Annotation,
  Message,
  Notebook,
  PassageNote,
  Source,
} from "../types";

type ExportSource = Pick<Source, "id" | "name" | "kind">;

function blockquote(value: string) {
  return value
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function sourceLabel(source: ExportSource | undefined, page: number) {
  const name = source?.name ?? "Source";
  const kind = source?.kind === "pptx" ? "Slide" : "Page";
  return `\`${name.replaceAll("`", "'")}\` · ${kind} ${page}`;
}

function citationsFor(message: Message) {
  return (message.citations ?? []).filter((citation) =>
    usesCitation(message.content, citation, message.citations ?? []),
  );
}

function appendAnswer(
  lines: string[],
  message: Message,
  sources: Map<string, ExportSource>,
) {
  if (!message.content.trim() || message.incomplete || message.cancelled)
    return;
  lines.push(message.content.trim());
  const citations = citationsFor(message);
  if (citations.length) {
    lines.push(
      `**Sources:** ${citations
        .map(
          (citation) =>
            `[${citation.id}] ${sourceLabel(sources.get(citation.sourceId), citation.page)}`,
        )
        .join("; ")}`,
    );
  }
  lines.push("");
}

function previousQuestion(messages: Message[], answerIndex: number) {
  for (let index = answerIndex - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user")
      return (messages[index].originalPrompt ?? messages[index].content).trim();
  }
  return "";
}

function appendPassageNote(
  lines: string[],
  note: PassageNote,
  sources: Map<string, ExportSource>,
) {
  const source = sources.get(note.sourceId);
  const heading = note.topic
    ? note.question
    : passageTitle(note.question, note.quote) || "Passage note";
  lines.push(`### ${heading.replace(/\r?\n/g, " ")}`);
  lines.push(`**${sourceLabel(source, note.page)}**`, "");
  if (note.quote.trim()) lines.push(blockquote(note.quote), "");

  let question = note.question;
  let wroteAnswer = false;
  for (const message of note.messages) {
    if (message.role === "user") {
      question = (message.originalPrompt ?? message.content).trim() || question;
      continue;
    }
    if (!message.content.trim() || message.incomplete || message.cancelled)
      continue;
    if (question) lines.push(`**${question}**`, "");
    appendAnswer(lines, message, sources);
    wroteAnswer = true;
  }
  if (!wroteAnswer && note.question) lines.push(`**${note.question}**`, "");
}

export function exportNotebookNotes(
  notebook: Notebook,
  annotations: Annotation[],
  sourceList: ExportSource[],
) {
  const sources = new Map(sourceList.map((source) => [source.id, source]));
  const lines = [
    `# ${notebook.title.replace(/\r?\n/g, " ").trim() || "Notebook"}`,
    "",
  ];

  lines.push("## Notebook notes", "");
  lines.push(notebook.notes.trim() || "_No notebook notes yet._", "");

  const passageNotes = notebook.passageNotes ?? [];
  const passageMessageIds = new Set(
    passageNotes.flatMap((note) => note.messages.map((message) => message.id)),
  );
  const savedAnswers = notebook.messages.flatMap((message, index) => {
    if (
      message.role !== "assistant" ||
      !message.savedToNotes ||
      passageMessageIds.has(message.id) ||
      !message.content.trim() ||
      message.incomplete ||
      message.cancelled
    )
      return [];
    return [
      { answer: message, question: previousQuestion(notebook.messages, index) },
    ];
  });

  if (savedAnswers.length) {
    lines.push("## Answers saved to Notes", "");
    for (const { answer, question } of savedAnswers) {
      if (question) lines.push(`### ${question.replace(/\r?\n/g, " ")}`, "");
      appendAnswer(lines, answer, sources);
    }
  }

  if (passageNotes.length) {
    lines.push("## Passage notes", "");
    for (const note of passageNotes) appendPassageNote(lines, note, sources);
  }

  if (annotations.length) {
    lines.push("## Highlights & annotations", "");
    for (const annotation of annotations) {
      lines.push(
        `### ${sourceLabel(sources.get(annotation.sourceId), annotation.page)}`,
      );
      if (annotation.quote.trim()) lines.push(blockquote(annotation.quote));
      if (annotation.note.trim())
        lines.push(`\n**Note:** ${annotation.note.trim()}`);
      if (annotation.tags?.length)
        lines.push(`\n**Tags:** ${annotation.tags.join(", ")}`);
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
