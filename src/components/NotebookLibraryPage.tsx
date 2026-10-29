import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { NotebookLibrary } from "./NotebookLibrary";
import { NotebookCreateDialog } from "./NotebookCreateDialog";
import { storage } from "../lib/storage";
import { useAppearance } from "../lib/appearance";
import type { Notebook, Source } from "../types";
import "./notebook-library-page.css";
export default function NotebookLibraryPage() {
  useAppearance();
  const [data, setData] = useState<{
    notebooks: Notebook[];
    sources: Source[];
  }>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    setError("");
    setData(undefined);
    void storage
      .read()
      .then((saved) => {
        if (alive) setData(saved);
      })
      .catch(() => {
        if (alive)
          setError(
            "Could not load your notebooks. Allow browser storage and try again.",
          );
      });
    return () => {
      alive = false;
    };
  }, [retry]);
  return (
    <div className="notebook-library-page">
      <header>
        <a href="/" className="library-home">
          <BookOpen size={22} />
          NemoDoc
        </a>
        <a href="/">
          <ArrowLeft size={15} />
          Home
        </a>
      </header>
      <main>
        <h1>All notebooks</h1>
        <p className="library-page-intro">
          Choose a notebook to open, or create a new one.
        </p>
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setRetry((n) => n + 1)}
            >
              Try again
            </button>
          </div>
        ) : !data ? (
          <p role="status">Loading notebooks…</p>
        ) : (
          <NotebookLibrary
            notebooks={data.notebooks}
            sources={data.sources}
            activeId=""
            busy={false}
            onOpen={(id) =>
              window.location.assign(`/app?notebook=${encodeURIComponent(id)}`)
            }
            onCreate={() => setCreateOpen(true)}
          />
        )}
      </main>
      {createOpen && (
        <NotebookCreateDialog onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}
