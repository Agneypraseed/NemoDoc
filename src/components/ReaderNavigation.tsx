import { useEffect, useRef, useState } from "react";
import { Bookmark, List, LayoutGrid } from "lucide-react";
import { pdfjs } from "../lib/documents";
import { slideImage } from "../lib/page-image";
import type { Source } from "../types";
function SlideThumbnail({
  slide,
}: {
  slide: NonNullable<Source["slides"]>[number];
}) {
  const [url, setUrl] = useState("");
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    let alive = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void slideImage(slide)
          .then((image) => {
            if (alive) setUrl(image);
          })
          .catch(() => {});
      },
      { rootMargin: "100px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [slide]);
  return (
    <img
      ref={ref}
      src={url || undefined}
      className="page-thumbnail"
      alt="Slide preview"
    />
  );
}

function Thumbnail({
  doc,
  page,
}: {
  doc?: pdfjs.PDFDocumentProxy;
  page: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!doc || !ref.current) return;
    let render: pdfjs.RenderTask | undefined,
      disposed = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void doc
          .getPage(page)
          .then((p) => {
            if (disposed || !ref.current) return;
            const base = p.getViewport({ scale: 1 }),
              viewport = p.getViewport({ scale: 86 / base.width });
            ref.current.width = viewport.width;
            ref.current.height = viewport.height;
            render = p.render({ canvas: ref.current, viewport });
            return render.promise;
          })
          .catch(() => {});
      },
      { rootMargin: "100px" },
    );
    observer.observe(ref.current);
    return () => {
      disposed = true;
      observer.disconnect();
      render?.cancel();
    };
  }, [doc, page]);
  return <canvas ref={ref} className="page-thumbnail" />;
}

export function ReaderNavigation({
  source,
  doc,
  page,
  navigate,
}: {
  source: Source;
  doc?: pdfjs.PDFDocumentProxy;
  page: number;
  navigate: (page: number) => void;
}) {
  const [tab, setTab] = useState<"pages" | "outline" | "bookmarks">("pages");
  const [outline, setOutline] = useState<
    { title: string; page: number; depth: number }[]
  >([]);
  useEffect(() => {
    let alive = true;
    setOutline([]);
    if (!doc) return;
    void (async () => {
      const items = await doc.getOutline();
      const result: typeof outline = [];
      const visit = async (nodes: NonNullable<typeof items>, depth = 0) => {
        for (const node of nodes) {
          try {
            const dest =
              typeof node.dest === "string"
                ? await doc.getDestination(node.dest)
                : node.dest;
            const pageNumber = dest
              ? typeof dest[0] === "number"
                ? dest[0] + 1
                : (await doc.getPageIndex(dest[0])) + 1
              : 1;
            result.push({ title: node.title, page: pageNumber, depth });
          } catch {
            /* A broken outline destination does not prevent reading. */
          }
          if (node.items.length) await visit(node.items, depth + 1);
        }
      };
      if (items) await visit(items);
      if (alive) setOutline(result);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [doc]);
  const pages =
    tab === "bookmarks"
      ? (source.bookmarks ?? [])
      : source.pages.map((_, i) => i + 1);
  return (
    <nav className="reader-navigation" aria-label="Document navigation">
      <div className="navigation-tabs">
        {(
          [
            ["pages", LayoutGrid, "Page thumbnails"],
            ["outline", List, "Document outline"],
            ["bookmarks", Bookmark, "Bookmarks"],
          ] as const
        ).map(([name, Icon, label]) => (
          <button
            key={name}
            className={`icon-button small ${tab === name ? "selected" : ""}`}
            aria-label={label}
            onClick={() => setTab(name)}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
      <div className="navigation-scroll">
        {tab === "outline" ? (
          outline.length ? (
            outline.map((item, i) => (
              <button
                key={i}
                className="outline-item"
                style={{ paddingLeft: 10 + item.depth * 9 }}
                onClick={() => navigate(item.page)}
              >
                {item.title}
                <small>{item.page}</small>
              </button>
            ))
          ) : (
            <p className="navigation-empty">This document has no outline.</p>
          )
        ) : pages.length ? (
          pages.map((number) => (
            <button
              key={number}
              className={`thumbnail-button ${number === page ? "active" : ""}`}
              aria-label={`Go to page ${number}`}
              onClick={() => navigate(number)}
            >
              {source.kind === "pdf" ? (
                <Thumbnail doc={doc} page={number} />
              ) : (
                source.slides?.[number - 1] && (
                  <SlideThumbnail slide={source.slides[number - 1]} />
                )
              )}
              <span>
                {number}
                {source.bookmarks?.includes(number) && (
                  <Bookmark size={9} fill="currentColor" />
                )}
              </span>
            </button>
          ))
        ) : (
          <p className="navigation-empty">Bookmark a page to keep it here.</p>
        )}
      </div>
    </nav>
  );
}
