import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { apiJSON } from "../lib/api";
import { Modal } from "./Modal";
import type { Citation, Source } from "../types";
export function NotebookSearch({
  sources,
  onCitation,
  onClose,
}: {
  sources: Source[];
  onCitation: (c: Citation) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{ citations: Citation[]; mode: string }>();
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
    <Modal title="Search your sources" onClose={onClose}>
      <p className="modal-description">
        Find ideas by meaning across the selected sources. NVIDIA embeddings are
        cached while the server runs.
      </p>
      <form
        className="semantic-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="Search notebook ideas"
          placeholder="What are these sources saying about…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="primary-button"
          disabled={busy || !query.trim() || !sources.length}
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
        <p role="status">Indexing and searching {sources.length} sources…</p>
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
    </Modal>
  );
}
