import type { Rect } from "../types";

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
