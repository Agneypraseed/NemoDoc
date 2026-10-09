import type { Citation } from "../types";

// Accept common model formatting without inventing or correcting references.
// Page-qualified citations must agree with the retrieved ID's original page.
export function normalizeCitations(content: string, citations: Citation[]) {
  const known = new Map(citations.map((c) => [c.id, c]));
  return content
    .replace(
      /\[([\d\s,;]+),\s*(?:p(?:age)?\.?\s*)(\d+)\](?!\()/gi,
      (original, ids: string, page: string) => {
        const numbers = ids.split(/[,;]/).map((id) => Number(id.trim()));
        return numbers.every((id) => known.get(id)?.page === Number(page))
          ? numbers.map((id) => `[${id}]`).join(" ")
          : original;
      },
    )
    .replace(/\[((?:\d+\s*[,;]\s*)+\d+)\](?!\()/g, (original, ids: string) => {
      const numbers = ids.split(/[,;]/).map((id) => Number(id.trim()));
      return numbers.every((id) => known.has(id))
        ? numbers.map((id) => `[${id}]`).join(" ")
        : original;
    });
}
export function usesCitation(
  content: string,
  citation: Citation,
  citations: Citation[],
) {
  return new RegExp(`\\[${citation.id}\\](?!\\()`).test(
    normalizeCitations(content, citations),
  );
}
export function citationMarkdown(content: string, citations: Citation[]) {
  return normalizeCitations(content, citations).replace(
    /\[(\d+)\](?!\()/g,
    (original, id: string) =>
      citations.some((c) => c.id === Number(id))
        ? `[${id}](#citation-${id})`
        : original,
  );
}
