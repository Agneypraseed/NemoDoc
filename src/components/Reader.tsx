import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Highlighter,
  Maximize2,
  MessageSquarePlus,
  Minus,
  Plus,
  Search,
  X,
  Bookmark,
  PanelLeft,
  Pencil,
  StickyNote,
  Undo2,
  Redo2,
  ScanText,
  Image,
} from "lucide-react";
import { pdfjs, pdfOptions } from "../lib/documents";
import { download } from "../lib/storage";
import { ReaderNavigation } from "./ReaderNavigation";
import { AnnotationOverlay } from "./AnnotationOverlay";
import { exportAnnotatedPdf } from "../lib/pdf-export";
import { evidenceRects } from "../lib/evidence";
import { slideImage } from "../lib/page-image";
import type {
  Annotation,
  HighlightColor,
  Rect,
  Source,
  ViewMode,
} from "../types";

interface Selection {
  page: number;
  quote: string;
  rects: Rect[];
  x: number;
  y: number;
}
interface Props {
  source?: Source;
  annotations: Annotation[];
  page: number;
  navigationKey: number;
  setPage: (page: number) => void;
  onAnnotate: (annotation: Annotation) => void;
  onAsk: (quote: string, page: number) => void;
  onSelectAnnotation: (annotation: Annotation) => void;
  onUpload: () => void;
  onUpdateSource?: (source: Source) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  evidence?: { page: number; text: string; key: number };
  onOCR?: (page: number, image: string) => void;
  onVisual?: (page: number, image: string) => void;
  keyboardEnabled?: boolean;
}

function PdfPage({
  doc,
  number,
  width,
  onError,
  initialAspect,
}: {
  doc: pdfjs.PDFDocumentProxy;
  number: number;
  width: number;
  onError: (error: string) => void;
  initialAspect: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(initialAspect),
    [near, setNear] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: "500px" },
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return;
    let disposed = false,
      render: pdfjs.RenderTask | undefined,
      layer: pdfjs.TextLayer | undefined;
    (async () => {
      const page = await doc.getPage(number);
      if (disposed || !canvas.current || !text.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      setAspect(viewport.height / viewport.width);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.current.width = Math.floor(viewport.width * ratio);
      canvas.current.height = Math.floor(viewport.height * ratio);
      canvas.current.style.width = `${viewport.width}px`;
      canvas.current.style.height = `${viewport.height}px`;
      render = page.render({
        canvas: canvas.current,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      text.current.innerHTML = "";
      text.current.style.setProperty("--scale-factor", String(viewport.scale));
      text.current.style.setProperty(
        "--total-scale-factor",
        String(viewport.scale),
      );
      const content = await page.getTextContent();
      if (disposed) return;
      layer = new pdfjs.TextLayer({
        textContentSource: content,
        container: text.current,
        viewport,
      });
      await Promise.all([render.promise, layer.render()]);
    })().catch((error) => {
      if (
        !disposed &&
        !["RenderingCancelledException", "AbortException"].includes(error.name)
      )
        onError(
          "This page could not be rendered. Try downloading the original.",
        );
    });
    return () => {
      disposed = true;
      render?.cancel();
      layer?.cancel();
    };
  }, [doc, number, width, near, onError]);
  return (
    <div
      ref={container}
      className="pdf-render"
      style={{ width, aspectRatio: `1 / ${aspect}` }}
    >
      <canvas ref={canvas} />
      <div className="textLayer" ref={text} />
    </div>
  );
}

export function Reader({
  source,
  annotations,
  page,
  navigationKey,
  setPage,
  onAnnotate,
  onAsk,
  onSelectAnnotation,
  onUpload,
  onUpdateSource,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  evidence,
  onOCR,
  onVisual,
  keyboardEnabled = true,
}: Props) {
  const [mode, setMode] = useState<ViewMode>("vertical"),
    [zoom, setZoom] = useState(100),
    [doc, setDoc] = useState<pdfjs.PDFDocumentProxy>(),
    [error, setError] = useState("");
  const [selection, setSelection] = useState<Selection>(),
    [color, setColor] = useState<HighlightColor>("yellow");
  const [areaTool, setAreaTool] = useState(false),
    [area, setArea] = useState<{
      page: number;
      start: { x: number; y: number };
      rect: Rect;
    }>();
  const [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState(""),
    [pageInput, setPageInput] = useState(String(page));
  const scroller = useRef<HTMLDivElement>(null),
    sizeRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(700);
  const [navigation, setNavigation] = useState(0);
  const [showNavigation, setShowNavigation] = useState(false);
  const [tool, setTool] = useState<"select" | "pen" | "sticky">("select");
  const [pen, setPen] = useState<{
    page: number;
    points: { x: number; y: number }[];
  }>();
  const [support, setSupport] = useState<Rect[]>([]);
  const [pageAspects, setPageAspects] = useState<number[]>([]);
  const updateRef = useRef(onUpdateSource);
  updateRef.current = onUpdateSource;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const fractionRef = useRef(0),
    resumeRef = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const persist = () => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      const current = sourceRef.current;
      if (current)
        updateRef.current?.({
          ...current,
          readingState: {
            page: currentPage.current,
            mode,
            zoom,
            fraction: fractionRef.current,
          },
        });
    }, 300);
  };
  const pagesRef = useRef(new Map<number, HTMLDivElement>());
  const count = source?.pages.length ?? 0;
  const pageWidth = Math.max(
    180,
    (Math.min(
      mode === "book"
        ? (available - 76 - (showNavigation ? 120 : 0)) / 2
        : available - 76 - (showNavigation ? 120 : 0),
      source?.kind === "pptx" ? 860 : 650,
    ) *
      zoom) /
      100,
  );
  const currentPage = useRef(page);
  useEffect(() => {
    currentPage.current = page;
  }, [page]);
  useEffect(() => () => clearTimeout(persistTimer.current), []);
  useEffect(() => {
    if (source) persist();
  }, [mode, zoom]);
  useEffect(() => {
    if (!evidence) {
      setSupport([]);
      return;
    }
    let attempts = 0;
    const timer = setInterval(() => {
      const element = pagesRef.current.get(evidence.page);
      if (element) {
        const rects = evidenceRects(element, evidence.text);
        if (rects.length) {
          setSupport(rects);
          const root = scroller.current;
          if (root && mode === "vertical")
            root.scrollTop =
              root.scrollTop +
              element.getBoundingClientRect().top -
              root.getBoundingClientRect().top +
              rects[0].y * element.clientHeight -
              80;
          clearInterval(timer);
        }
      }
      if (++attempts >= 30) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [evidence?.key, doc, mode]);
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setAvailable(entries[0].contentRect.width),
    );
    if (sizeRef.current) observer.observe(sizeRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPageInput(String(page));
  }, [page]);
  useEffect(() => {
    clearTimeout(persistTimer.current);
    setDoc(undefined);
    setError("");
    setSelection(undefined);
    setQuery("");
    setZoom(source?.readingState?.zoom ?? 100);
    setMode(source?.readingState?.mode ?? "vertical");
    fractionRef.current =
      source?.readingState?.page === page ? source.readingState.fraction : 0;
    resumeRef.current = fractionRef.current > 0;
    setTool("select");
    setSupport([]);
    if (!source || source.kind !== "pdf") return;
    let disposed = false;
    let task: pdfjs.PDFDocumentLoadingTask | undefined;
    source.blob
      .arrayBuffer()
      .then((data) => {
        if (disposed) return;
        task = pdfjs.getDocument({ ...pdfOptions, data });
        return task.promise;
      })
      .then(async (pdf) => {
        if (pdf && !disposed) {
          const dimensions =
            source.pageAspects ??
            (await Promise.all(
              Array.from({ length: pdf.numPages }, async (_, i) => {
                const p = await pdf.getPage(i + 1);
                const v = p.getViewport({ scale: 1 });
                return v.height / v.width;
              }),
            ));
          if (disposed) return;
          setPageAspects(dimensions);
          setDoc(pdf);
          if (!source.pageAspects && sourceRef.current?.id === source.id)
            updateRef.current?.({
              ...sourceRef.current,
              pageAspects: dimensions,
            });
        }
      })
      .catch(() => {
        if (!disposed)
          setError(
            "Unable to open this PDF. Download the original or import an unlocked copy.",
          );
      });
    return () => {
      disposed = true;
      void task?.destroy();
    };
  }, [source?.id]);
  useLayoutEffect(() => {
    if (mode === "book") return;
    const element = pagesRef.current.get(page);
    const root = scroller.current;
    if (!element || !root) return;
    // Navigation preserves the active page across layout and zoom changes.
    if (mode === "horizontal")
      root.scrollTo({
        left:
          root.scrollLeft +
          element.getBoundingClientRect().left -
          root.getBoundingClientRect().left -
          30,
      });
    else
      root.scrollTo({
        top:
          root.scrollTop +
          element.getBoundingClientRect().top -
          root.getBoundingClientRect().top -
          30 +
          (resumeRef.current ? fractionRef.current * element.clientHeight : 0),
      });
    resumeRef.current = false;
  }, [page, mode, zoom, source?.id, doc, navigation, navigationKey, pageWidth]);
  useEffect(() => {
    const root = scroller.current;
    if (!root || mode === "book") return;
    let raf = 0;
    const scroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rootRect = root.getBoundingClientRect();
        let closest = Infinity,
          active = currentPage.current;
        pagesRef.current.forEach((element, number) => {
          const rect = element.getBoundingClientRect();
          const distance =
            mode === "vertical"
              ? rect.top <= rootRect.top + 31
                ? rootRect.top + 31 - rect.top
                : Infinity
              : Math.abs(rect.left - rootRect.left - 30);
          if (distance < closest) {
            closest = distance;
            active = number;
          }
        });
        // Update the counter without forcing the user to a page boundary.
        currentPage.current = active;
        setPageInput(String(active));
        const element = pagesRef.current.get(active);
        fractionRef.current =
          element && mode === "vertical"
            ? Math.max(
                0,
                Math.min(
                  1,
                  (rootRect.top + 30 - element.getBoundingClientRect().top) /
                    element.clientHeight,
                ),
              )
            : 0;
        persist();
      });
    };
    root.addEventListener("scroll", scroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", scroll);
      cancelAnimationFrame(raf);
    };
  }, [mode, zoom, source?.id, doc]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!keyboardEnabled) return;
      if (
        ["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName) ||
        (event.target as HTMLElement).isContentEditable
      )
        return;
      if (event.key === "Escape") {
        setSelection(undefined);
        setAreaTool(false);
        setSearchOpen(false);
        setTool("select");
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) onRedo?.();
        else onUndo?.();
      }
      if (event.key === "ArrowRight")
        navigate(
          Math.min(count, currentPage.current + (mode === "book" ? 2 : 1)),
        );
      if (event.key === "ArrowLeft")
        navigate(Math.max(1, currentPage.current - (mode === "book" ? 2 : 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const navigate = (value: number) => {
    setPage(Math.min(count, Math.max(1, value)));
    setNavigation((n) => n + 1);
    setSelection(undefined);
  };
  const capture = () => {
    if (areaTool || tool !== "select") return;
    const selected = window.getSelection();
    if (
      !selected ||
      selected.isCollapsed ||
      !selected.rangeCount ||
      !selected.toString().trim()
    )
      return;
    const range = selected.getRangeAt(0);
    const parent =
      range.startContainer.parentElement?.closest<HTMLElement>("[data-page]");
    if (
      !parent ||
      !scroller.current?.contains(parent) ||
      range.endContainer.parentElement?.closest("[data-page]") !== parent
    )
      return;
    const rect = parent.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.width > 1 && r.height > 1)
      .map((r) => ({
        x: (r.left - rect.left) / rect.width,
        y: (r.top - rect.top) / rect.height,
        width: r.width / rect.width,
        height: r.height / rect.height,
      }));
    if (!rects.length) return;
    const bounds = range.getBoundingClientRect();
    setSelection({
      page: Number(parent.dataset.page),
      quote: selected.toString().trim(),
      rects,
      x: Math.max(
        170,
        Math.min(innerWidth - 180, bounds.left + bounds.width / 2),
      ),
      y: Math.max(90, bounds.top - 12),
    });
  };
  const save = (note: boolean, kind: Annotation["kind"] = "highlight") => {
    if (!selection || !source) return;
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      sourceId: source.id,
      page: selection.page,
      quote: selection.quote,
      note: "",
      color,
      rects: selection.rects,
      createdAt: Date.now(),
      kind,
    };
    onAnnotate(annotation);
    if (note) onSelectAnnotation(annotation);
    setSelection(undefined);
    window.getSelection()?.removeAllRanges();
  };
  const position = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const pageImage = async (number: number) => {
    if (doc && source?.kind === "pdf") {
      const pdfPage = await doc.getPage(number);
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({
        scale: Math.min(1800 / base.width, 1800 / base.height),
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pdfPage.render({ canvas, viewport }).promise;
      return canvas.toDataURL("image/jpeg", 0.85);
    }
    const slide = source?.slides?.[number - 1];
    if (!slide) throw new Error("Open a page before using visual tools.");
    return slideImage(slide);
  };
  const visiblePages =
    mode === "book"
      ? Array.from(
          { length: Math.min(2, count - Math.floor((page - 1) / 2) * 2) },
          (_, i) => Math.floor((page - 1) / 2) * 2 + i + 1,
        )
      : Array.from({ length: count }, (_, i) => i + 1);
  const matches =
    query.trim() && source
      ? source.pages
          .map((text, i) => ({ text, page: i + 1 }))
          .filter((p) => p.text.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 30)
      : [];
  return (
    <section className="reader" ref={sizeRef} aria-label="Document reader">
      <div className="reader-toolbar">
        <div className="reader-file">
          <span className={`file-icon ${source?.kind ?? "pdf"}`}>
            {source?.kind === "pptx" ? "P" : "PDF"}
          </span>
          <div>
            <strong>
              {source?.name.replace(/\.(pdf|pptx)$/i, "") ??
                "Your reading space"}
            </strong>
            <span>
              {source
                ? `${count} ${source.kind === "pptx" ? "slides" : "pages"} · ${source.kind.toUpperCase()}`
                : "Add a source to begin"}
            </span>
          </div>
        </div>
        <div className="toolbar-actions">
          <button
            className={`icon-button ${showNavigation ? "selected" : ""}`}
            aria-label="Toggle page navigation"
            disabled={!source}
            onClick={() => setShowNavigation(!showNavigation)}
          >
            <PanelLeft size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Bookmark current page"
            aria-pressed={!!source?.bookmarks?.includes(Number(pageInput))}
            disabled={!source}
            onClick={() => {
              if (source) {
                const number = currentPage.current;
                const bookmarks = source.bookmarks?.includes(number)
                  ? source.bookmarks.filter((p) => p !== number)
                  : [...(source.bookmarks ?? []), number].sort((a, b) => a - b);
                onUpdateSource?.({ ...source, bookmarks });
              }
            }}
          >
            <Bookmark
              size={16}
              fill={
                source?.bookmarks?.includes(Number(pageInput))
                  ? "currentColor"
                  : "none"
              }
            />
          </button>
          <button
            className={`icon-button ${searchOpen ? "selected" : ""}`}
            title="Find in document"
            aria-label="Find in document"
            disabled={!source}
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Export annotated PDF"
            title="Export annotated PDF"
            disabled={source?.kind !== "pdf"}
            onClick={() => {
              if (source)
                void exportAnnotatedPdf(source, annotations)
                  .then((blob) =>
                    download(
                      blob,
                      source.name.replace(/\.pdf$/i, " - annotated.pdf"),
                    ),
                  )
                  .catch((e) => setError(e.message));
            }}
          >
            <Download size={17} />
            <span className="annotation-export-dot" />
          </button>
          <button
            className="icon-button"
            title="Download original"
            aria-label="Download original"
            disabled={!source}
            onClick={() => source && download(source.blob, source.name)}
          >
            <Download size={17} />
          </button>
        </div>
      </div>
      <div
        className="annotation-tools"
        role="toolbar"
        aria-label="Annotation tools"
      >
        <button
          className={`tool-button ${tool === "pen" ? "active" : ""}`}
          aria-label="Pen tool"
          aria-pressed={tool === "pen"}
          onClick={() => {
            setTool(tool === "pen" ? "select" : "pen");
            setAreaTool(false);
          }}
        >
          <Pencil size={14} />
          Pen
        </button>
        <button
          className={`tool-button ${tool === "sticky" ? "active" : ""}`}
          aria-label="Sticky note tool"
          aria-pressed={tool === "sticky"}
          onClick={() => {
            setTool(tool === "sticky" ? "select" : "sticky");
            setAreaTool(false);
          }}
        >
          <StickyNote size={14} />
          Note
        </button>
        <div className="highlight-colors">
          {(["yellow", "mint", "lavender"] as const).map((c) => (
            <button
              key={c}
              className={`color-dot ${c} ${color === c ? "chosen" : ""}`}
              aria-label={`Tool color ${c}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <span className="tools-spacer" />
        <button
          className="icon-button small"
          aria-label="Undo annotation"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 size={14} />
        </button>
        <button
          className="icon-button small"
          aria-label="Redo annotation"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 size={14} />
        </button>
        <button
          className="tool-button"
          aria-label="Recognize page text"
          disabled={!source || (source.kind === "pdf" && !doc)}
          onClick={async () => {
            try {
              const number = currentPage.current;
              onOCR?.(number, await pageImage(number));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <ScanText size={14} />
          OCR
        </button>
        <button
          className="tool-button"
          aria-label="Ask about page image"
          disabled={!source || (source.kind === "pdf" && !doc)}
          onClick={async () => {
            try {
              const number = currentPage.current;
              onVisual?.(number, await pageImage(number));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Image size={14} />
          Ask image
        </button>
      </div>
      <div className="reader-controls">
        <div className="segmented view-switch" aria-label="Reading layout">
          {(
            [
              ["vertical", ArrowDown, "Vertical"],
              ["horizontal", ArrowRight, "Horizontal"],
              ["book", BookOpen, "Book"],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              className={mode === value ? "active" : ""}
              aria-label={`${label} view`}
              aria-pressed={mode === value}
              onClick={() => {
                const active = currentPage.current;
                setPage(active);
                setMode(value);
                setSelection(undefined);
              }}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="zoom-controls">
          <button
            className="icon-button small"
            aria-label="Zoom out"
            disabled={zoom <= 50}
            onClick={() => {
              setPage(currentPage.current);
              setZoom(Math.max(50, zoom - 10));
            }}
          >
            <Minus size={14} />
          </button>
          <button
            className="zoom-value"
            aria-label="Reset zoom"
            onClick={() => {
              setPage(currentPage.current);
              setZoom(100);
            }}
          >
            {zoom}%
          </button>
          <button
            className="icon-button small"
            aria-label="Zoom in"
            disabled={zoom >= 200}
            onClick={() => {
              setPage(currentPage.current);
              setZoom(Math.min(200, zoom + 10));
            }}
          >
            <Plus size={14} />
          </button>
          <i />
          <button
            className={`icon-button small ${areaTool ? "selected" : ""}`}
            aria-label="Area highlight"
            title="Drag to highlight an area"
            aria-pressed={areaTool}
            disabled={!source}
            onClick={() => {
              setAreaTool(!areaTool);
              setTool("select");
              setSelection(undefined);
            }}
          >
            <Highlighter size={16} />
          </button>
          <button
            className="icon-button small"
            aria-label="Focus reader"
            title="Focus reader"
            onClick={() =>
              sizeRef.current
                ?.requestFullscreen?.()
                .catch(() =>
                  setError("Fullscreen is unavailable in this browser."),
                )
            }
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
      {searchOpen && (
        <div className="document-search">
          <Search size={15} />
          <input
            autoFocus
            placeholder="Find a word or phrase…"
            aria-label="Search document text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span>{matches.length} pages</span>
          <button
            className="icon-button small"
            aria-label="Close search"
            onClick={() => {
              setSearchOpen(false);
              setQuery("");
            }}
          >
            <X size={15} />
          </button>
          {query && (
            <div className="search-results">
              {matches.length ? (
                matches.map((match) => {
                  const index = match.text
                    .toLowerCase()
                    .indexOf(query.toLowerCase());
                  return (
                    <button
                      key={match.page}
                      onClick={() => navigate(match.page)}
                    >
                      <span>p. {match.page}</span>
                      {match.text.slice(Math.max(0, index - 30), index + 100)}
                    </button>
                  );
                })
              ) : (
                <p>No matching text. Scanned pages may need OCR.</p>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}
          <button
            className="icon-button small"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {areaTool && (
        <div className="reader-hint">
          Drag over any part of the page to highlight it. Press Escape to
          finish.
        </div>
      )}
      <div className="reader-stage">
        {showNavigation && source && (
          <ReaderNavigation
            source={source}
            doc={doc}
            page={Number(pageInput)}
            navigate={navigate}
          />
        )}
        <div
          className={`page-scroller ${mode} ${areaTool || tool !== "select" ? "area-tool" : ""}`}
          ref={scroller}
          onMouseUp={capture}
          onTouchEnd={() => setTimeout(capture, 50)}
          onScroll={() => setSelection(undefined)}
        >
          {!source ? (
            <div className="reader-empty">
              <BookOpen size={38} strokeWidth={1} />
              <h2>Room for a new perspective.</h2>
              <p>
                Add a PDF or slide deck.
                <br />
                Make the margins your own.
              </p>
              <button className="primary-button" onClick={onUpload}>
                <Plus size={16} /> Add a source
              </button>
            </div>
          ) : source.kind === "pdf" && !doc && !error ? (
            <div className="reader-empty">
              <span className="spinner" />
              <p>Opening your document…</p>
            </div>
          ) : (
            visiblePages.map((number) => (
              <div className="page-shell" key={`${source.id}-${number}`}>
                <div
                  className="document-page"
                  data-page={number}
                  ref={(el) => {
                    if (el) pagesRef.current.set(number, el);
                    else pagesRef.current.delete(number);
                  }}
                  style={{ width: pageWidth }}
                  onPointerDown={(event) => {
                    if (tool === "sticky") {
                      const start = position(event);
                      const a: Annotation = {
                        id: crypto.randomUUID(),
                        sourceId: source.id,
                        page: number,
                        quote: "Sticky note",
                        note: "",
                        color,
                        kind: "sticky",
                        rects: [{ ...start, width: 0.035, height: 0.028 }],
                        createdAt: Date.now(),
                      };
                      onAnnotate(a);
                      onSelectAnnotation(a);
                      setTool("select");
                      return;
                    }
                    if (tool === "pen") {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setPen({ page: number, points: [position(event)] });
                      return;
                    }
                    if (!areaTool) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const start = position(event);
                    setArea({
                      page: number,
                      start,
                      rect: { ...start, width: 0, height: 0 },
                    });
                  }}
                  onPointerMove={(event) => {
                    if (pen?.page === number) {
                      const point = position(event);
                      setPen((previous) =>
                        previous
                          ? { ...previous, points: [...previous.points, point] }
                          : previous,
                      );
                      return;
                    }
                    if (!area || area.page !== number) return;
                    const end = position(event);
                    setArea({
                      ...area,
                      rect: {
                        x: Math.min(area.start.x, end.x),
                        y: Math.min(area.start.y, end.y),
                        width: Math.abs(end.x - area.start.x),
                        height: Math.abs(end.y - area.start.y),
                      },
                    });
                  }}
                  onPointerUp={(event) => {
                    if (pen?.page === number) {
                      if (pen.points.length > 1) {
                        const xs = pen.points.map((p) => p.x),
                          ys = pen.points.map((p) => p.y);
                        onAnnotate({
                          id: crypto.randomUUID(),
                          sourceId: source.id,
                          page: number,
                          kind: "pen",
                          quote: "Pen annotation",
                          note: "",
                          color,
                          points: pen.points,
                          rects: [
                            {
                              x: Math.min(...xs),
                              y: Math.min(...ys),
                              width: Math.max(...xs) - Math.min(...xs),
                              height: Math.max(...ys) - Math.min(...ys),
                            },
                          ],
                          createdAt: Date.now(),
                        });
                      }
                      setPen(undefined);
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                      return;
                    }
                    if (!area || !source) return;
                    if (area.rect.width > 0.005 && area.rect.height > 0.005) {
                      const annotation: Annotation = {
                        id: crypto.randomUUID(),
                        sourceId: source.id,
                        page: number,
                        quote: "Area highlight",
                        note: "",
                        color,
                        rects: [area.rect],
                        createdAt: Date.now(),
                        kind: "area",
                      };
                      onAnnotate(annotation);
                      onSelectAnnotation(annotation);
                    }
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    setArea(undefined);
                    setAreaTool(false);
                  }}
                  onPointerCancel={() => {
                    setArea(undefined);
                    setPen(undefined);
                  }}
                >
                  {source.kind === "pdf" && doc ? (
                    <PdfPage
                      doc={doc}
                      number={number}
                      width={pageWidth}
                      onError={setError}
                      initialAspect={pageAspects[number - 1] ?? 792 / 612}
                    />
                  ) : (
                    source.slides?.[number - 1] && (
                      <div
                        className="slide-render"
                        style={{
                          aspectRatio: `${source.slides[number - 1].width} / ${source.slides[number - 1].height}`,
                        }}
                      >
                        {source.slides[number - 1].elements.map(
                          (element, i) => (
                            <div
                              key={i}
                              className={`slide-element ${element.kind}`}
                              style={{
                                left: `${element.x * 100}%`,
                                top: `${element.y * 100}%`,
                                width: `${element.width * 100}%`,
                                height: `${element.height * 100}%`,
                                fontSize:
                                  ((element.fontSize ?? 20) * pageWidth) /
                                  ((source.slides![number - 1].width / 914400) *
                                    72),
                                fontWeight: element.bold ? 600 : 400,
                                color: element.color,
                              }}
                            >
                              {element.kind === "image" ? (
                                <img
                                  src={element.image}
                                  alt="Embedded slide content"
                                  draggable={false}
                                />
                              ) : (
                                element.text
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    )
                  )}
                  <AnnotationOverlay
                    annotations={annotations.filter(
                      (a) => a.sourceId === source.id && a.page === number,
                    )}
                    onSelect={onSelectAnnotation}
                    evidence={evidence?.page === number ? support : []}
                  />
                  {pen?.page === number && (
                    <svg
                      className={`pen-overlay pending ${color}`}
                      viewBox="0 0 1 1"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points={pen.points
                          .map((p) => `${p.x},${p.y}`)
                          .join(" ")}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth=".004"
                      />
                    </svg>
                  )}
                  {source.ocr?.[number]?.regions.length ? (
                    <div className="ocr-text">
                      {source.ocr[number].regions.map((r, i) => (
                        <span
                          key={i}
                          style={{
                            left: `${r.x * 100}%`,
                            top: `${r.y * 100}%`,
                            width: `${r.width * 100}%`,
                            height: `${r.height * 100}%`,
                          }}
                        >
                          {r.text}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="annotation-layer">
                    {area?.page === number && (
                      <div
                        className={`highlight pending ${color}`}
                        style={{
                          left: `${area.rect.x * 100}%`,
                          top: `${area.rect.y * 100}%`,
                          width: `${area.rect.width * 100}%`,
                          height: `${area.rect.height * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className="page-caption">
                  <span>
                    {source.kind === "pptx" ? "SLIDE" : "PAGE"}{" "}
                    {String(number).padStart(2, "0")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="reader-footer">
        <span>
          <span className="status-dot" />
          {source
            ? "Select text to highlight or ask a question"
            : "A little space to think"}
        </span>
        <div className="page-navigation">
          <button
            className="icon-button small"
            aria-label="Previous page"
            disabled={!source || Number(pageInput) <= 1}
            onClick={() =>
              navigate(currentPage.current - (mode === "book" ? 2 : 1))
            }
          >
            <ChevronLeft size={16} />
          </button>
          <label>
            <input
              aria-label="Page number"
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => navigate(Number(pageInput) || 1)}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(Number(pageInput) || 1);
              }}
            />
            <span>/ {count || "–"}</span>
          </label>
          <button
            className="icon-button small"
            aria-label="Next page"
            disabled={!source || Number(pageInput) >= count}
            onClick={() =>
              navigate(currentPage.current + (mode === "book" ? 2 : 1))
            }
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      {selection && (
        <div
          className="selection-toolbar"
          role="toolbar"
          aria-label="Selected text actions"
          style={{ left: selection.x, top: selection.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="highlight-colors">
            {(["yellow", "mint", "lavender"] as const).map((c) => (
              <button
                key={c}
                className={`color-dot ${c} ${color === c ? "chosen" : ""}`}
                aria-label={`${c} highlight color`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <i />
          <button onClick={() => save(false)}>
            <Highlighter size={14} />
            Highlight
          </button>
          <button onClick={() => save(false, "underline")}>Underline</button>
          <button onClick={() => save(true)}>
            <MessageSquarePlus size={14} />
            Note
          </button>
          <button
            className="ask-selection"
            onClick={() => {
              onAsk(selection.quote, selection.page);
              setSelection(undefined);
              window.getSelection()?.removeAllRanges();
            }}
          >
            Ask AI
          </button>
        </div>
      )}
    </section>
  );
}
