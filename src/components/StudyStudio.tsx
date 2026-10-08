import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Copy,
  Download,
  Layers,
  LoaderCircle,
  Network,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiJSON } from "../lib/api";
import { download } from "../lib/storage";
import type { Citation, Source, StudyArtifact } from "../types";

const kinds = [
  ["flashcards", Layers, "Flashcards"],
  ["quiz", Copy, "Quiz"],
  ["guide", BookOpen, "Study guide"],
  ["mindmap", Network, "Mind map"],
] as const;
export function StudyStudio({
  notebookId,
  sources,
  artifacts,
  onSave,
  onDelete,
  onCitation,
}: {
  notebookId: string;
  sources: Source[];
  artifacts: StudyArtifact[];
  onSave: (a: StudyArtifact) => void;
  onDelete: (id: string) => void;
  onCitation: (c: Citation) => void;
}) {
  const [activeId, setActiveId] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [index, setIndex] = useState(0),
    [flipped, setFlipped] = useState(false),
    [answers, setAnswers] = useState<Record<number, number>>({}),
    [checked, setChecked] = useState(false);
  const [progressSaved, setProgressSaved] = useState(false),
    [progressBusy, setProgressBusy] = useState(false);
  const abort = useRef<AbortController>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    setActiveId("");
    abort.current?.abort();
    setError("");
  }, [notebookId]);
  useEffect(() => {
    setIndex(0);
    setFlipped(false);
    setAnswers({});
    setChecked(false);
    setProgressSaved(false);
    setEditing(false);
  }, [activeId]);
  const list = artifacts.filter((a) => a.notebookId === notebookId),
    active = list.find((a) => a.id === activeId);
  const generate = async (kind: StudyArtifact["kind"]) => {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(kind);
    setError("");
    try {
      const value = await apiJSON<
        Omit<StudyArtifact, "id" | "notebookId" | "createdAt">
      >(
        "/api/study",
        {
          kind,
          sources: sources.map(({ id, name, pages }) => ({ id, name, pages })),
        },
        controller.signal,
      );
      const next = {
        ...value,
        id: crypto.randomUUID(),
        notebookId,
        createdAt: Date.now(),
      };
      onSave(next);
      setActiveId(next.id);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const cites = (ids: number[]) => (
    <div className="study-citations">
      {ids.map((id) => {
        const c = active?.citations.find((c) => c.id === id);
        return (
          c && (
            <button key={id} title={c.text} onClick={() => onCitation(c)}>
              [{id}] {c.sourceName.replace(/\.(pdf|pptx)$/i, "")} · p. {c.page}
            </button>
          )
        );
      })}
    </div>
  );
  const updateItem = (
    at: number,
    patch: Partial<StudyArtifact["items"][number]>,
  ) => {
    if (active)
      onSave({
        ...active,
        items: active.items.map((item, i) =>
          i === at ? { ...item, ...patch } : item,
        ),
      });
  };
  const exportArtifact = () => {
    if (!active) return;
    const text =
      active.kind === "guide"
        ? `# ${active.title}\n\n${active.content}\n\n${active.citations.map((c) => `[${c.id}] ${c.sourceName}, page ${c.page}`).join("\n")}`
        : JSON.stringify(active, null, 2);
    download(
      new Blob([text], {
        type: active.kind === "guide" ? "text/markdown" : "application/json",
      }),
      `${active.title.replace(/[^\p{L}\p{N} -]/gu, "") || "Study material"}.${active.kind === "guide" ? "md" : "json"}`,
    );
  };
  return (
    <div className="study-studio">
      <div className="studio-intro">
        <span className="eyebrow">TURN READING INTO UNDERSTANDING</span>
        <h2>Your study studio</h2>
        <p>Build something useful from {sources.length} selected sources.</p>
      </div>
      <div className="studio-create">
        {kinds.map(([kind, Icon, label]) => (
          <button
            key={kind}
            disabled={!!busy || !sources.length}
            onClick={() => void generate(kind)}
          >
            {busy === kind ? (
              <LoaderCircle className="spin" size={19} />
            ) : (
              <Icon size={19} />
            )}
            <strong>{label}</strong>
            <span>
              <Plus size={13} />
            </span>
          </button>
        ))}
      </div>
      {busy && (
        <div className="studio-progress" role="status">
          <Sparkles size={16} />
          Reading your sources and building {busy}…
          <button
            aria-label="Cancel generation"
            onClick={() => abort.current?.abort()}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {list.length > 0 && (
        <label className="field-label">
          Saved materials
          <select
            aria-label="Saved study material"
            value={activeId}
            onChange={(e) => setActiveId(e.target.value)}
          >
            <option value="">Choose a material…</option>
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} · {a.kind}
              </option>
            ))}
          </select>
        </label>
      )}
      {active && (
        <section className="study-artifact" aria-label="Study material">
          <div className="study-heading">
            {editing ? (
              <input
                aria-label="Study title"
                value={active.title}
                onChange={(e) => onSave({ ...active, title: e.target.value })}
              />
            ) : (
              <h3>{active.title}</h3>
            )}
            <div>
              <button
                aria-label="Edit study material"
                aria-pressed={editing}
                className="icon-button small"
                onClick={() => setEditing(!editing)}
              >
                <Pencil size={15} />
              </button>
              <button
                aria-label="Export study material"
                className="icon-button small"
                onClick={exportArtifact}
              >
                <Download size={15} />
              </button>
              <button
                aria-label="Delete study material"
                className="icon-button small"
                onClick={() => {
                  onDelete(active.id);
                  setActiveId("");
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          {active.kind === "guide" &&
            (editing ? (
              <textarea
                className="guide-editor"
                aria-label="Study guide content"
                value={active.content}
                onChange={(e) => onSave({ ...active, content: e.target.value })}
              />
            ) : (
              <div className="study-guide">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) =>
                      href?.startsWith("#citation-") ? (
                        <button
                          className="inline-citation"
                          onClick={() => {
                            const c = active.citations.find(
                              (c) => c.id === Number(href.slice(10)),
                            );
                            if (c) onCitation(c);
                          }}
                        >
                          {children}
                        </button>
                      ) : (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ),
                  }}
                >
                  {active.content.replace(/\[(\d+)\](?!\()/g, (_, n) =>
                    active.citations.some((c) => c.id === Number(n))
                      ? `[${n}](#citation-${n})`
                      : `[${n}]`,
                  )}
                </ReactMarkdown>
              </div>
            ))}
          {active.kind === "flashcards" && active.items[index] && (
            <>
              <button
                className={`flashcard ${flipped ? "flipped" : ""}`}
                aria-label={flipped ? "Flashcard answer" : "Flashcard question"}
                onClick={() => setFlipped(!flipped)}
              >
                <small>
                  {flipped ? "ANSWER" : "QUESTION"} · {index + 1}/
                  {active.items.length}
                </small>
                <p>
                  {flipped
                    ? active.items[index].answer
                    : active.items[index].question}
                </p>
                <span>
                  Click to {flipped ? "see question" : "reveal answer"}
                </span>
              </button>
              {cites(active.items[index].citationIds)}
              <div className="card-navigation">
                <button
                  disabled={!index}
                  onClick={() => {
                    setIndex(index - 1);
                    setFlipped(false);
                  }}
                >
                  Previous
                </button>
                <button
                  disabled={index === active.items.length - 1}
                  onClick={() => {
                    setIndex(index + 1);
                    setFlipped(false);
                  }}
                >
                  Next card
                </button>
              </div>
              {editing && (
                <div className="card-editor">
                  <label className="field-label">
                    Question
                    <textarea
                      aria-label="Flashcard question text"
                      value={active.items[index].question}
                      onChange={(e) =>
                        updateItem(index, { question: e.target.value })
                      }
                    />
                  </label>
                  <label className="field-label">
                    Answer
                    <textarea
                      aria-label="Flashcard answer text"
                      value={active.items[index].answer}
                      onChange={(e) =>
                        updateItem(index, { answer: e.target.value })
                      }
                    />
                  </label>
                </div>
              )}
            </>
          )}
          {active.kind === "quiz" && (
            <div className="study-quiz">
              {checked && (
                <p className="quiz-score" role="status">
                  {
                    active.items.filter(
                      (item, i) => answers[i] === item.correct,
                    ).length
                  }{" "}
                  / {active.items.length} correct
                </p>
              )}
              {active.items.map((item, i) => (
                <fieldset key={i}>
                  <legend>
                    {i + 1}. {item.question}
                  </legend>
                  {(item.choices ?? []).map((choice, j) => (
                    <label
                      key={j}
                      className={
                        checked && j === item.correct
                          ? "correct"
                          : checked && answers[i] === j
                            ? "incorrect"
                            : ""
                      }
                    >
                      <input
                        type="radio"
                        name={`quiz-${active.id}-${i}`}
                        checked={answers[i] === j}
                        disabled={checked}
                        onChange={() => setAnswers({ ...answers, [i]: j })}
                      />
                      {choice}
                    </label>
                  ))}
                  {checked && <p>{item.answer}</p>}
                  {cites(item.citationIds)}
                  {editing && (
                    <div className="card-editor">
                      <input
                        aria-label={`Quiz question ${i + 1}`}
                        value={item.question}
                        onChange={(e) =>
                          updateItem(i, { question: e.target.value })
                        }
                      />
                      <textarea
                        aria-label={`Quiz explanation ${i + 1}`}
                        value={item.answer}
                        onChange={(e) =>
                          updateItem(i, { answer: e.target.value })
                        }
                      />
                      {item.choices?.map((choice, j) => (
                        <input
                          key={j}
                          aria-label={`Question ${i + 1} choice ${j + 1}`}
                          value={choice}
                          onChange={(e) =>
                            updateItem(i, {
                              choices: item.choices!.map((v, k) =>
                                k === j ? e.target.value : v,
                              ),
                            })
                          }
                        />
                      ))}
                      <label>
                        Correct choice
                        <select
                          value={item.correct}
                          onChange={(e) =>
                            updateItem(i, { correct: Number(e.target.value) })
                          }
                        >
                          {item.choices?.map((_, j) => (
                            <option key={j} value={j}>
                              {j + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </fieldset>
              ))}
              <button
                className="primary-button"
                disabled={
                  !checked && Object.keys(answers).length < active.items.length
                }
                onClick={() => {
                  if (checked) setAnswers({});
                  setChecked(!checked);
                  setProgressSaved(false);
                }}
              >
                {checked ? "Try again" : "Check answers"}
              </button>
              {checked && (
                <button
                  className="secondary-button"
                  disabled={progressBusy || progressSaved}
                  onClick={async () => {
                    setProgressBusy(true);
                    setError("");
                    try {
                      const weak = active.items
                        .filter((item, i) => answers[i] !== item.correct)
                        .map((i) => i.question);
                      await apiJSON("/api/agent/memory", {
                        notebookId,
                        kind: "progress",
                        deadline: "",
                        text: `Quiz result for ${active.title}: ${active.items.length - weak.length}/${active.items.length} correct. ${weak.length ? "Topics to revisit: " + weak.join("; ") : "All questions answered correctly."}`.slice(
                          0,
                          2000,
                        ),
                      });
                      setProgressSaved(true);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setProgressBusy(false);
                    }
                  }}
                >
                  {progressSaved
                    ? "Progress remembered"
                    : "Remember quiz result"}
                </button>
              )}
            </div>
          )}
          {active.kind === "mindmap" && (
            <MindMap
              key={active.id}
              artifact={active}
              editing={editing}
              onSave={onSave}
              cites={cites}
            />
          )}
          <small className="study-save">
            <CheckSaved />
            Saved locally · included in notebook backups
          </small>
        </section>
      )}
    </div>
  );
}
function CheckSaved() {
  return <span aria-hidden="true">✓</span>;
}
function MindMap({
  artifact,
  editing,
  onSave,
  cites,
}: {
  artifact: StudyArtifact;
  editing: boolean;
  onSave: (a: StudyArtifact) => void;
  cites: (ids: number[]) => React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [selected, setSelected] = useState(""),
    [zoom, setZoom] = useState(1);
  const nodes = artifact.nodes ?? [],
    map = new Map(nodes.map((n) => [n.id, n]));
  const visible = nodes.filter((n) => {
    let parent = n.parentId,
      guard = 0;
    while (parent && guard++ < nodes.length) {
      if (collapsed.has(parent)) return false;
      parent = map.get(parent)?.parentId;
    }
    return true;
  });
  const positions = new Map<string, { x: number; y: number }>(),
    rows = new Map<number, number>();
  for (const n of visible) {
    let depth = 0,
      parent = n.parentId;
    while (parent && depth < nodes.length) {
      depth++;
      parent = map.get(parent)?.parentId;
    }
    const row = rows.get(depth) ?? 0;
    rows.set(depth, row + 1);
    positions.set(n.id, { x: depth * 230 + 20, y: row * 96 + 20 });
  }
  const width = Math.max(600, ...[...positions.values()].map((p) => p.x + 220)),
    height = Math.max(220, ...[...positions.values()].map((p) => p.y + 80));
  const current = nodes.find((n) => n.id === selected);
  return (
    <>
      <div className="map-controls">
        <button
          aria-label="Zoom out mind map"
          disabled={zoom <= 0.5}
          onClick={() => setZoom(zoom - 0.1)}
        >
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          aria-label="Zoom in mind map"
          disabled={zoom >= 1.5}
          onClick={() => setZoom(zoom + 0.1)}
        >
          +
        </button>
        <small>Click a node to explore · scroll to pan</small>
      </div>
      <div className="mindmap-viewport">
        <div
          className="mindmap-canvas"
          style={{ width: width * zoom, height: height * zoom }}
        >
          <div
            style={{
              width,
              height,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              position: "relative",
            }}
          >
            <svg width={width} height={height} aria-hidden="true">
              {visible.map((n) => {
                const p = positions.get(n.id)!,
                  from = n.parentId ? positions.get(n.parentId) : undefined;
                return (
                  from && (
                    <path
                      key={n.id}
                      d={`M ${from.x + 200} ${from.y + 30} C ${from.x + 218} ${from.y + 30}, ${p.x - 18} ${p.y + 30}, ${p.x} ${p.y + 30}`}
                    />
                  )
                );
              })}
            </svg>
            {visible.map((n) => {
              const p = positions.get(n.id)!;
              return (
                <div
                  key={n.id}
                  className={`map-node ${selected === n.id ? "selected" : ""}`}
                  style={{ left: p.x, top: p.y }}
                >
                  <button onClick={() => setSelected(n.id)}>{n.label}</button>
                  {nodes.some((x) => x.parentId === n.id) && (
                    <button
                      aria-label={`${collapsed.has(n.id) ? "Expand" : "Collapse"} ${n.label}`}
                      onClick={() => {
                        const next = new Set(collapsed);
                        if (next.has(n.id)) next.delete(n.id);
                        else next.add(n.id);
                        setCollapsed(next);
                      }}
                    >
                      {collapsed.has(n.id) ? "+" : "−"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {current && (
        <div className="map-detail">
          {editing ? (
            <textarea
              aria-label="Mind map node label"
              value={current.label}
              onChange={(e) =>
                onSave({
                  ...artifact,
                  nodes: nodes.map((n) =>
                    n.id === current.id ? { ...n, label: e.target.value } : n,
                  ),
                })
              }
            />
          ) : (
            <strong>{current.label}</strong>
          )}
          {cites(current.citationIds)}
        </div>
      )}
    </>
  );
}
