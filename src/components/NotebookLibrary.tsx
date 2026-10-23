import { useState } from "react";
import { BookOpen, ChevronRight, Plus, Search } from "lucide-react";
import type { Notebook, Source } from "../types";
import "./notebook-library.css";

export function NotebookLibrary({
  notebooks,
  sources,
  activeId,
  busy,
  onOpen,
  onCreate,
}: {
  notebooks: Notebook[];
  sources: Source[];
  activeId: string;
  busy: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("title");
  const counts = new Map<string, number>();
  for (const source of sources)
    counts.set(source.notebookId, (counts.get(source.notebookId) ?? 0) + 1);
  const visible = notebooks
    .filter((notebook) =>
      `${notebook.title} ${notebook.description ?? ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "newest"
        ? b.createdAt - a.createdAt
        : a.title.localeCompare(b.title),
    );
  return (
    <section className="notebook-library" aria-label="Notebook library">
      <div className="library-controls">
        <label className="library-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Find a notebook"
            placeholder="Find a notebook…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Sort notebooks"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="title">Title</option>
          <option value="newest">Newest</option>
        </select>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={onCreate}
        >
          <Plus size={16} />
          New notebook
        </button>
      </div>
      <div className="library-list">
        {visible.map((notebook) => {
          const count = counts.get(notebook.id) ?? 0;
          return (
            <button
              type="button"
              key={notebook.id}
              className={`notebook-card library-row ${activeId === notebook.id ? "active" : ""}`}
              aria-current={activeId === notebook.id ? "page" : undefined}
              onClick={() => onOpen(notebook.id)}
            >
              <span className="library-book" aria-hidden="true">
                <BookOpen size={24} strokeWidth={1.25} />
              </span>
              <span className="library-row-copy">
                <span className="library-row-title">
                  <strong>{notebook.title}</strong>
                </span>
                {notebook.description && (
                  <span className="library-description">
                    {notebook.description}
                  </span>
                )}
                <small>
                  {count} {count === 1 ? "source" : "sources"}
                </small>
              </span>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {!visible.length && (
        <div className="library-empty">
          <p>
            {query.trim() ? "No notebooks match your search." : "No notebooks."}
          </p>
          {query.trim() && (
            <button type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          )}
        </div>
      )}
      <p className="library-count" role="status">
        {visible.length} {visible.length === 1 ? "notebook" : "notebooks"}
        {query.trim() ? ` of ${notebooks.length}` : ""}
      </p>
    </section>
  );
}
