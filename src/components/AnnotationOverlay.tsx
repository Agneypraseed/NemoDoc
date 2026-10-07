import type { Annotation, Rect } from "../types";

export function AnnotationOverlay({
  annotations,
  onSelect,
  evidence = [],
}: {
  annotations: Annotation[];
  onSelect: (annotation: Annotation) => void;
  evidence?: Rect[];
}) {
  return (
    <div className="annotation-layer">
      {annotations.map((a) =>
        a.kind === "pen" ? (
          <svg
            key={a.id}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className={`pen-overlay ${a.color}`}
          >
            <polyline
              points={(a.points ?? []).map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth=".004"
              strokeLinecap="round"
              strokeLinejoin="round"
              onClick={() => onSelect(a)}
            >
              <title>{a.note || "Pen annotation"}</title>
            </polyline>
          </svg>
        ) : (
          a.rects.map((r, i) => (
            <button
              key={`${a.id}-${i}`}
              className={`highlight ${a.kind ?? "highlight"} ${a.color}`}
              title={a.note || a.quote}
              aria-label={`Annotation: ${a.note || a.quote}`}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.width * 100}%`,
                height: `${r.height * 100}%`,
              }}
              onClick={() => onSelect(a)}
            >
              {a.kind === "sticky" ? "✎" : null}
            </button>
          ))
        ),
      )}
      {evidence.map((r, i) => (
        <div
          key={i}
          className="evidence-highlight"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.width * 100}%`,
            height: `${r.height * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
