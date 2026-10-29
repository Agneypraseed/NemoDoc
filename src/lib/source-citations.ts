import type { Citation, Source } from "../types";
export function availableCitations(
  citations: Citation[],
  sources: Source[],
  notebookId?: string,
) {
  return citations.filter(
    (c) =>
      Number.isInteger(c.page) &&
      c.page >= 1 &&
      sources.some(
        (s) =>
          s.id === c.sourceId &&
          (!notebookId || s.notebookId === notebookId) &&
          c.page <= s.pages.length,
      ),
  );
}
