import type { Annotation, Notebook, PassageNote, Source } from "../types";

/** Preserve authored/source-linked content before deleting its original file. */
export function preserveSourceNotes(
  notebook: Notebook,
  source: Source,
  annotations: Annotation[],
) {
  if (notebook.id !== source.notebookId)
    return { notebook, block: "", passages: [] as PassageNote[] };
  const passages = (notebook.passageNotes ?? []).filter(
    (n) => n.sourceId === source.id,
  );
  const highlights = annotations.filter((a) => a.sourceId === source.id);
  const content = [
    ...passages.map((n) =>
      [
        `### ${n.question || "Passage note"}`,
        `Original ${source.kind === "pptx" ? "slide" : "page"} ${n.page}`,
        n.quote,
        ...n.messages.map(
          (m) =>
            `**${m.role === "user" ? "Question" : "Answer"}${m.incomplete ? " (unfinished)" : ""}:**\n\n${m.content}`,
        ),
      ].join("\n\n"),
    ),
    ...highlights.map((a) =>
      [
        `### ${a.kind ?? "Highlight"} on ${source.kind === "pptx" ? "slide" : "page"} ${a.page}`,
        a.quote,
        a.note,
        a.tags?.length ? `Tags: ${a.tags.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    ),
  ].join("\n\n");
  const block = content
    ? `${notebook.notes ? "\n\n" : ""}## Preserved notes from ${source.name}\n\n_Snapshot kept when this source was removed. Original page links are unavailable while it is removed._\n\n${content}\n`
    : "";
  return {
    passages,
    block,
    notebook: {
      ...notebook,
      notes: notebook.notes + block,
      ...(block ? { notesUpdatedAt: Date.now() } : {}),
      passageNotes: (notebook.passageNotes ?? []).filter(
        (n) => n.sourceId !== source.id,
      ),
    },
  };
}
export function restoreSourceNotes(
  notebook: Notebook,
  passages: PassageNote[],
  block: string,
): Notebook {
  const index = block ? notebook.notes.indexOf(block) : -1;
  const removable = index >= 0 && index === notebook.notes.lastIndexOf(block);
  const known = new Set((notebook.passageNotes ?? []).map((n) => n.id));
  return {
    ...notebook,
    ...(removable
      ? {
          notes:
            notebook.notes.slice(0, index) +
            notebook.notes.slice(index + block.length),
          notesUpdatedAt: Date.now(),
        }
      : {}),
    passageNotes: [
      ...(notebook.passageNotes ?? []),
      ...passages
        .filter((n) => !known.has(n.id))
        .map((n) => ({
          ...n,
          active: false,
          collapsed: true,
          messages: n.messages.map(
            (m) =>
              notebook.messages.find((current) => current.id === m.id) ?? m,
          ),
        })),
    ],
  };
}
