import type { Rect } from "../types";

/**
 * PDF text layers can return one client rect per glyph. Passage anchors should
 * read as a single underline per visual line instead of a trail of dots.
 */
export function mergeRectsByLine(rects: Rect[]): Rect[] {
  const lines: { center: number; rects: Rect[] }[] = [];
  for (const rect of [...rects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const center = rect.y + rect.height / 2;
    const tolerance = Math.max(0.0075, rect.height * 0.65);
    let line = lines.find(
      (candidate) => Math.abs(candidate.center - center) <= tolerance,
    );
    if (!line) {
      line = { center, rects: [] };
      lines.push(line);
    }
    line.rects.push(rect);
    line.center =
      line.rects.reduce((sum, item) => sum + item.y + item.height / 2, 0) /
      line.rects.length;
  }

  return lines
    .map(({ rects: line }) => {
      const left = Math.min(...line.map((rect) => rect.x));
      const top = Math.min(...line.map((rect) => rect.y));
      const right = Math.max(...line.map((rect) => rect.x + rect.width));
      const bottom = Math.max(...line.map((rect) => rect.y + rect.height));
      return { x: left, y: top, width: right - left, height: bottom - top };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function evidenceRects(page: HTMLElement, excerpt: string): Rect[] {
  const spans = Array.from(
    page.querySelectorAll<HTMLElement>(
      ".textLayer span, .slide-element.text, .ocr-text span",
    ),
  );
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const parts = spans.map((span) => ({
    span,
    text: normalize(span.textContent ?? ""),
  }));
  const text = parts.map((p) => p.text).join(" ");
  const query = normalize(excerpt);
  let start = text.indexOf(query),
    length = query.length;
  // OCR and PDF extraction can differ in whitespace or line-end hyphenation.
  if (start < 0) {
    length = Math.min(100, query.length);
    start = text.indexOf(query.slice(0, length));
  }
  if (start < 0) return [];
  const bounds = page.getBoundingClientRect();
  let offset = 0;
  return parts.flatMap(({ span, text }) => {
    const beginning = offset;
    offset += text.length + 1;
    if (offset <= start || beginning >= start + length) return [];
    const r = span.getBoundingClientRect();
    return [
      {
        x: (r.left - bounds.left) / bounds.width,
        y: (r.top - bounds.top) / bounds.height,
        width: r.width / bounds.width,
        height: r.height / bounds.height,
      },
    ];
  });
}
