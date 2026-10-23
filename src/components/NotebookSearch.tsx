import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { apiJSON } from "../lib/api";
import { Modal } from "./Modal";
import type { Citation, Source } from "../types";
import type { SearchNote } from "../lib/search-notes";
export function NotebookSearch({
  sources,
  notes,
  onCitation,
  onNote,
  onClose,
}: {
  sources: Source[];
  notes: SearchNote[];
  onCitation: (c: Citation) => void;
  onNote: (note: SearchNote) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{ citations: Citation[]; mode: string }>();
  const [scope, setScope] = useState<"sources" | "notes">("sources");
  const [noteResult, setNoteResult] = useState<{
    results: SearchNote[];
    mode: string;
  }>();
  const abort = useRef<AbortController>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const search = async () => {
    if (!query.trim()) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      if (scope === "notes")
        setNoteResult(
          await apiJSON(
            "/api/search/notes",
            { question: query, notes },
            controller.signal,
          ),
        );
      else
        setResult(
          await apiJSON(
            "/api/search",
            {
              question: query,
              sources: sources.map(({ id, name, pages }) => ({
                id,
                name,
                pages,
              })),
            },
            controller.signal,
          ),
        );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <Modal
      title={scope === "sources" ? "Search your sources" : "Search your notes"}
      onClose={onClose}
    >
      <div className="segmented search-scopes" aria-label="Search scope">
        {(["sources", "notes"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={scope === value ? "active" : ""}
            aria-pressed={scope === value}
            onClick={() => {
              abort.current?.abort();
              setBusy(false);
              setScope(value);
              setError("");
              setResult(undefined);
              setNoteResult(undefined);
            }}
          >
            {value === "sources" ? "Sources" : "Notes"}
          </button>
        ))}
      </div>
      <form
        className="semantic-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="Search notebook ideas"
          placeholder={
            scope === "notes"
              ? "Find a note about…"
              : "What are these sources saying about…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="primary-button"
          disabled={
            busy ||
            !query.trim() ||
            !(scope === "notes" ? notes.length : sources.length)
          }
        >
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Search size={16} />
          )}
          Search
        </button>
      </form>
      {busy && (
        <p role="status">
          Searching{" "}
          {scope === "notes"
            ? `${notes.length} notes`
            : `${sources.length} sources`}
          …
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="semantic-results">
          <small>
            {result.citations.length} passages · {result.mode}
          </small>
          {!result.citations.length && (
            <p>No readable passages found. Use OCR for scanned pages.</p>
          )}
          {result.citations.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onCitation(c);
                onClose();
              }}
            >
              <strong>
                {c.sourceName} <span>p. {c.page}</span>
              </strong>
              <p>{c.text}</p>
            </button>
          ))}
        </div>
      )}
      {scope === "notes" && !notes.length && (
        <p className="modal-description">No notes to search.</p>
      )}
      {noteResult && (
        <div className="semantic-results">
          <small>
            {noteResult.results.length} notes · {noteResult.mode}
          </small>
          {!noteResult.results.length && (
            <p>No matching notes. Try another phrase.</p>
          )}
          {noteResult.results.map((note) => (
            <button
              key={note.id}
              onClick={() => {
                onNote(note);
                onClose();
              }}
            >
              <strong>
                {note.title}
                <span>
                  {note.kind === "answer"
                    ? "Saved answer"
                    : note.kind === "passage"
                      ? "Passage note"
                      : note.kind === "highlight"
                        ? "Highlight"
                        : "Notebook"}
                </span>
              </strong>
              <p>{note.text}</p>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
