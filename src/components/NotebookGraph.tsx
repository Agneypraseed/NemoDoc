import { useEffect, useRef, useState } from "react";
import type { Citation, Source, StudyArtifact } from "../types";
import type { SearchNote } from "../lib/search-notes";
import { buildNotebookGraph } from "../lib/notebook-graph";
import "./notebook-graph.css";

export function NotebookGraph({
  notebookId,
  title,
  sources,
  notes,
  artifacts,
  onCitation,
  onNote,
}: {
  notebookId: string;
  title: string;
  sources: Source[];
  notes: SearchNote[];
  artifacts: StudyArtifact[];
  onCitation: (citation: Citation) => void;
  onNote: (note: SearchNote) => void;
}) {
  const [view, setView] = useState<"graph" | "table">("graph");
  const canvas = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(280, entries[0].contentRect.width)),
    );
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [view]);
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [selected, setSelected] = useState("notebook");
  const graph = buildNotebookGraph(
    notebookId,
    title,
    sources,
    notes,
    artifacts,
  );
  const nodes = graph.nodes.filter(
    (n) =>
      n.kind === "notebook" ||
      (n.kind === "source"
        ? !sourceId || n.id === `source:${sourceId}`
        : (!sourceId || n.references.some((r) => r.sourceId === sourceId)) &&
          `${n.label} ${n.text}`.toLowerCase().includes(query.toLowerCase())),
  );
  const active = nodes.find((n) => n.id === selected) ?? nodes[0];
  const left = nodes.filter(
    (n) => n.kind === "source" || n.kind === "notebook",
  );
  const right = nodes.filter(
    (n) => n.kind !== "source" && n.kind !== "notebook",
  );
  const compact = width < 640;
  const positions = new Map<string, { x: number; y: number }>([
    ...left.map(
      (n, i) =>
        [n.id, { x: compact ? width / 2 : 150, y: 45 + i * 80 }] as const,
    ),
    ...right.map(
      (n, i) =>
        [
          n.id,
          {
            x: compact ? width / 2 : width - 150,
            y: 45 + (compact ? left.length + i : i) * 80,
          },
        ] as const,
    ),
  ]);
  const height = Math.max(
    200,
    (compact ? nodes.length : Math.max(left.length, right.length)) * 80 + 20,
  );
  return (
    <section className="notebook-graph" aria-label="Notebook connections">
      <p>
        Explore how your sources, notes, and study materials connect. Solid
        lines show source references; dashed lines show notebook membership.
      </p>
      <div className="graph-controls">
        <div role="group" aria-label="Connection display">
          {(["graph", "table"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {value === "graph" ? "Graph" : "Table"}
            </button>
          ))}
        </div>
        <label>
          Find notes or materials
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Source
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">All sources</option>
            {sources
              .filter((s) => s.notebookId === notebookId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <p role="status">{right.length} notes and study materials shown</p>
      {view === "graph" ? (
        <div
          ref={canvas}
          className="graph-canvas"
          tabIndex={0}
          aria-label="Scrollable notebook graph"
        >
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="group"
            aria-label="Sources and their connections"
          >
            {graph.edges.map((edge) => {
              const from = positions.get(edge.from),
                to = positions.get(edge.to);
              return from && to ? (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={
                    compact
                      ? `M ${from.x + 130} ${from.y} Q ${width - 3} ${(from.y + to.y) / 2} ${to.x + 130} ${to.y}`
                      : `M ${from.x} ${from.y} L ${to.x} ${to.y}`
                  }
                  className={edge.kind}
                />
              ) : null;
            })}
            {nodes.map((node) => {
              const point = positions.get(node.id)!;
              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.kind}: ${node.label}`}
                  aria-pressed={active.id === node.id}
                  onClick={() => setSelected(node.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(node.id);
                    }
                  }}
                  className={`graph-node ${node.kind}`}
                  transform={`translate(${point.x},${point.y})`}
                >
                  <title>{node.label}</title>
                  <rect x="-130" y="-25" width="260" height="50" rx="10" />
                  <text textAnchor="middle" y="-3">
                    {node.label.length > 32
                      ? node.label.slice(0, 29) + "..."
                      : node.label}
                  </text>
                  <text className="graph-kind" textAnchor="middle" y="15">
                    {node.kind}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="graph-table">
          <table>
            <caption>Notebook sources, notes, and study materials</caption>
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th>Source pages</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr key={n.id}>
                  <td>
                    <button type="button" onClick={() => setSelected(n.id)}>
                      {n.label}
                    </button>
                  </td>
                  <td>{n.kind}</td>
                  <td>
                    {n.references
                      .map((r) => `${r.sourceName}, page ${r.page}`)
                      .join("; ") || "Notebook"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!right.length && (
        <p>
          Add highlights, save cited answers, or create study materials to see
          their connections here.
        </p>
      )}
      <section className="graph-inspector" aria-label="Selected connection">
        <h3>{active.label}</h3>
        <p className="graph-detail">{active.text}</p>
        {active.note && (
          <button type="button" onClick={() => onNote(active.note!)}>
            Open note
          </button>
        )}
        <div className="graph-references">
          {active.references
            .filter(
              (r, i, all) =>
                all.findIndex(
                  (x) => x.sourceId === r.sourceId && x.page === r.page,
                ) === i,
            )
            .map((r) => (
              <button
                key={`${r.sourceId}:${r.page}`}
                type="button"
                onClick={() => onCitation(r)}
              >
                {r.sourceName} · Page {r.page}
              </button>
            ))}
        </div>
      </section>
    </section>
  );
}
