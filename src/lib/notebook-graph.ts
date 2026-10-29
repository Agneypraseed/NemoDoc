import type { Citation, Source, StudyArtifact } from "../types";
import type { SearchNote } from "./search-notes";
import { citationReferences } from "./citations";

export interface NotebookGraphNode {
  id: string;
  kind: "notebook" | "source" | "note" | "study";
  label: string;
  text: string;
  references: Citation[];
  note?: SearchNote;
}
export function buildNotebookGraph(
  notebookId: string,
  title: string,
  sources: Source[],
  notes: SearchNote[],
  artifacts: StudyArtifact[],
) {
  const local = sources.filter((s) => s.notebookId === notebookId);
  const byId = new Map(local.map((s) => [s.id, s]));
  const valid = (ref: { sourceId: string; page: number }): Citation[] => {
    const source = byId.get(ref.sourceId);
    return source &&
      Number.isInteger(ref.page) &&
      ref.page > 0 &&
      source.pages[ref.page - 1]?.trim()
      ? [
          {
            id: 1,
            sourceId: source.id,
            sourceName: source.name,
            page: ref.page,
            text: source.pages[ref.page - 1],
          },
        ]
      : [];
  };
  const nodes: NotebookGraphNode[] = [
    {
      id: "notebook",
      kind: "notebook",
      label: title,
      text: "Sources, notes, and study materials in this notebook.",
      references: [],
    },
  ];
  nodes.push(
    ...local.map((s) => ({
      id: `source:${s.id}`,
      kind: "source" as const,
      label: s.name,
      text: `${s.pages.length} ${s.kind === "pptx" ? "slides" : "pages"}`,
      references: s.pages
        .flatMap((_, i) => valid({ sourceId: s.id, page: i + 1 }))
        .slice(0, 1),
    })),
  );
  nodes.push(
    ...notes.map((n) => ({
      id: `note:${n.id}`,
      kind: "note" as const,
      label: n.title,
      text: n.text,
      note: n,
      references: (n.references ?? []).flatMap(valid),
    })),
  );
  for (const artifact of artifacts.filter((a) => a.notebookId === notebookId)) {
    const cited = new Set([
      ...citationReferences(artifact.content, artifact.citations),
      ...artifact.items.flatMap((i) => i.citationIds),
      ...(artifact.nodes ?? []).flatMap((n) => n.citationIds),
    ]);
    nodes.push({
      id: `study:${artifact.id}`,
      kind: "study",
      label: artifact.title,
      text: [
        artifact.content,
        ...artifact.items.map((i) => `${i.question}\n${i.answer}`),
      ]
        .filter(Boolean)
        .join("\n\n"),
      references: artifact.citations
        .filter((c) => cited.has(c.id))
        .flatMap(valid),
    });
  }
  const edges: { from: string; to: string; kind: "contains" | "references" }[] =
    [];
  for (const node of nodes.slice(1)) {
    const parents =
      node.kind === "source"
        ? []
        : [...new Set(node.references.map((r) => `source:${r.sourceId}`))];
    if (!parents.length)
      edges.push({ from: "notebook", to: node.id, kind: "contains" });
    else
      for (const parent of parents)
        edges.push({ from: parent, to: node.id, kind: "references" });
  }
  return { nodes, edges };
}
