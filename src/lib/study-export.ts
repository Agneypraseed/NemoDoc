import { citationReferences } from "./citations";
import { availableCitations } from "./source-citations";
import type { Source, StudyArtifact } from "../types";
function usedReferences(artifact: StudyArtifact) {
  return new Set(
    artifact.kind === "guide"
      ? citationReferences(artifact.content, artifact.citations)
      : artifact.kind === "mindmap"
        ? (artifact.nodes ?? []).flatMap((n) => n.citationIds)
        : artifact.items.flatMap((i) => i.citationIds),
  );
}
export function studyEvidence(artifact: StudyArtifact, sources: Source[]) {
  const used = usedReferences(artifact);
  return availableCitations(
    artifact.citations.filter((c) => used.has(c.id)),
    sources,
    artifact.notebookId,
  );
}
export function exportStudyMaterial(
  artifact: StudyArtifact,
  sources: Source[],
) {
  const citations = studyEvidence(artifact, sources);
  const used = usedReferences(artifact);
  const unavailable = artifact.citations
    .filter(
      (c) => used.has(c.id) && !citations.some((valid) => valid.id === c.id),
    )
    .map(
      (c) =>
        `[${c.id}] ${c.sourceName}, page ${c.page} (source page unavailable)`,
    );
  if (artifact.kind !== "guide")
    return JSON.stringify(
      {
        ...artifact,
        citations,
        ...(unavailable.length ? { unavailableReferences: unavailable } : {}),
      },
      null,
      2,
    );
  return (
    [
      `# ${artifact.title}`,
      artifact.focusQuestions?.length
        ? `## Personalized review focus\n\n${artifact.focusQuestions.map((q) => `- ${q}`).join("\n")}`
        : "",
      artifact.content,
      citations.length
        ? `## Cited sources\n\n${citations.map((c) => `[${c.id}] ${c.sourceName}, ${sources.find((s) => s.id === c.sourceId)?.kind === "pptx" ? "slide" : "page"} ${c.page}`).join("\n")}`
        : "",
      unavailable.length
        ? `## Unavailable references\n\n${unavailable.join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n") + "\n"
  );
}
