import type { Citation } from "../types";
type CitationReference = { id: number; page?: number };
const referencePattern = () =>
  /\[([\d\s,;]+)(?:,\s*p(?:age)?\.?\s*(\d+))?\](?!\()/gi;

// Accept common model formatting without inventing or correcting references.
// Page-qualified citations must agree with the retrieved ID's original page.
export function normalizeCitations(
  content: string,
  citations: CitationReference[],
) {
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
export function citationMarkdown(
  content: string,
  citations: CitationReference[],
) {
  return normalizeCitations(content, citations).replace(
    /\[(\d+)\](?!\()/g,
    (original, id: string) =>
      citations.some((c) => c.id === Number(id))
        ? `[${id}](#citation-${id})`
        : original,
  );
}
/** Unknown and invalid page-qualified references remain visible to validation. */
export function citationReferences(
  content: string,
  citations: CitationReference[],
) {
  const normalized = normalizeCitations(content, citations);
  return [...normalized.matchAll(referencePattern())].flatMap((m) => {
    const ids = m[1].split(/[,;]/).map((v) => Number(v.trim()));
    return m[2] &&
      ids.some(
        (id) => citations.find((c) => c.id === id)?.page !== Number(m[2]),
      )
      ? [-1]
      : ids;
  });
}

/** Repair feedback uses the same interpretation as rendering and validation. */
export function citationIssues(
  content: string,
  citations: CitationReference[],
) {
  const known = new Map(citations.map((c) => [c.id, c]));
  const issues: string[] = [];
  for (const m of normalizeCitations(content, citations).matchAll(
    referencePattern(),
  )) {
    for (const id of m[1].split(/[,;]/).map((v) => Number(v.trim()))) {
      const source = known.get(id);
      if (!source) issues.push(`Citation [${id}] was not retrieved.`);
      else if (m[2] && source.page !== Number(m[2]))
        issues.push(
          source.page === undefined
            ? `Citation [${id}] is web evidence and cannot have a PDF page qualifier.`
            : `Citation [${id}] is PDF page ${source.page}, not page ${m[2]}.`,
        );
    }
  }
  return [...new Set(issues)];
}
