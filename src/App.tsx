import { SupportingPages } from "./components/SupportingPages";
import {
  explicitPage,
  pageOnlyRequest,
  wantsPages,
} from "./lib/supporting-pages";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  FolderOpen,
  Grid2X2,
  Layers,
  LoaderCircle,
  MessageSquare,
  NotebookPen,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  RefreshCw,
  Upload,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import remarkGfm from "remark-gfm";
import { Reader } from "./components/Reader";
import { Modal } from "./components/Modal";
import { createDemo } from "./lib/demo";
import { importDocument } from "./lib/documents";
import { download, storage } from "./lib/storage";
import { streamChat } from "./lib/chat";
import { citationMarkdown, usesCitation } from "./lib/citations";
import { exportNotebookNotes } from "./lib/notes-export";
import { mergeStreamMessages, saveAnswerToNotes } from "./lib/save-answer";
import { createBackup, readBackup } from "./lib/backup";
import { apiJSON } from "./lib/api";
import { ConnectionSettings } from "./components/ConnectionSettings";
import { AppearanceSettings } from "./components/AppearanceSettings";
import { NotebookActions } from "./components/NotebookActions";
import { AnswerModeControl, type AnswerMode } from "./components/AnswerMode";
import { WorkspaceTabs } from "./components/WorkspaceTabs";
import { AssistantPanel } from "./components/AssistantPanel";
import { modelName, useAppearance } from "./lib/appearance";
import { NotebookSearch } from "./components/NotebookSearch";
import { StudyStudio } from "./components/StudyStudio";
import { AgentPanel } from "./components/AgentPanel";
import type {
  AIStatus,
  Annotation,
  Message,
  Notebook,
  Source,
  StudyArtifact,
  Citation,
  PassageNote,
  Rect,
} from "./types";

function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 28 28">
        <path d="M6 21V7h3l10 14h3V7h-3v9L9 7" />
      </svg>
    </span>
  );
}

function SavedAnswerCard({
  number,
  question,
  answer,
  sources,
  onCitation,
}: {
  number: number;
  question: Message;
  answer: Message;
  sources: Source[];
  onCitation: (citation: Citation) => void;
}) {
  const prompt =
    question.content.split("\n\nSelected passage from ")[0].trim() ||
    "Saved answer";
  const citations = (answer.citations ?? []).filter((citation) => {
    const source = sources.find(
      (candidate) => candidate.id === citation.sourceId,
    );
    return (
      source &&
      citation.page >= 1 &&
      citation.page <= source.pages.length &&
      usesCitation(answer.content, citation, answer.citations ?? [])
    );
  });

  return (
    <details className="saved-answer-card">
      <summary>
        <span className="saved-answer-index">
          {String(number).padStart(2, "0")}
        </span>
        <span className="saved-answer-summary">
          <small>Saved answer {number}</small>
          <strong>{prompt}</strong>
          <span>
            {citations.length
              ? `${citations.length} cited ${citations.length === 1 ? "page" : "pages"}`
              : "Saved from your conversation"}
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="saved-answer-detail">
        <div className="saved-answer-question">
          <span>Question</span>
          <p>{prompt}</p>
        </div>
        <div className="saved-answer-response message assistant">
          <span className="saved-answer-label">Answer</span>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[
              [rehypeKatex, { trust: false, maxExpand: 1000, maxSize: 20 }],
            ]}
            components={{
              a: ({ href, children }) => {
                const citation = href?.startsWith("#citation-")
                  ? citations.find((item) => item.id === Number(href.slice(10)))
                  : undefined;
                return citation ? (
                  <button
                    className="inline-citation"
                    onClick={() => onCitation(citation)}
                  >
                    {children}
                  </button>
                ) : (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {citationMarkdown(answer.content, citations)}
          </ReactMarkdown>
          {!!citations.length && (
            <div className="citation-list">
              {citations.map((citation) => (
                <button
                  key={`${citation.sourceId}:${citation.page}`}
                  title={citation.text}
                  onClick={() => onCitation(citation)}
                >
                  <span>{citation.id}</span>
                  {citation.sourceName
                    .replace(/\.(pdf|pptx)$/i, "")
                    .slice(0, 20)}
                  <small>
                    {sources.find((source) => source.id === citation.sourceId)
                      ?.kind === "pptx"
                      ? "Slide"
                      : "Page"}{" "}
                    {citation.page}
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

export default function App() {
  const { theme, setTheme } = useAppearance();
  const [compactLayout, setCompactLayout] = useState(
    () => window.matchMedia("(max-width: 960px)").matches,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("nemodoc-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const sidebarLauncher = useRef<HTMLButtonElement>(null);
  const sidebarCloser = useRef<HTMLButtonElement>(null);
  const returnSidebarFocus = useRef(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]),
    [sources, setSources] = useState<Source[]>([]),
    [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState(""),
    [sourceId, setSourceId] = useState(""),
    [page, setPage] = useState(1);
  const [navigationKey, setNavigationKey] = useState(0);
  const [artifacts, setArtifacts] = useState<StudyArtifact[]>([]);
  const [searchNotebook, setSearchNotebook] = useState(false);
  const [evidence, setEvidence] = useState<{
    page: number;
    text: string;
    key: number;
  }>();
  const [compareId, setCompareId] = useState(""),
    [comparePage, setComparePage] = useState(1);
  const [retrievalInfo, setRetrievalInfo] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false),
    [ocrError, setOcrError] = useState("");
  const [visual, setVisual] = useState<{
    image: string;
    sourceId: string;
    page: number;
  }>();
  const featureAbort = useRef<AbortController>(null);
  const [annotationFilter, setAnnotationFilter] = useState("");
  const [notesView, setNotesView] = useState<
    "answers" | "highlights" | "scratchpad"
  >("answers");
  const [historyVersion, setHistoryVersion] = useState(0);
  const undoStack = useRef<Annotation[][]>([]),
    redoStack = useRef<Annotation[][]>([]);
  const lastEdit = useRef({ key: "", time: 0 });
  const backupInput = useRef<HTMLInputElement>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set()),
    [tab, setTab] = useState<"chat" | "notes" | "studio" | "agent">("chat");
  const [status, setStatus] = useState<AIStatus>({
    configured: false,
    model: "nvidia/nemotron-3-nano-30b-a3b",
    local: false,
  });
  const [modal, setModal] = useState<
      "settings" | "new" | "library" | "help" | null
    >(null),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState("");
  const [ready, setReady] = useState(false),
    [importing, setImporting] = useState(""),
    [filter, setFilter] = useState("");
  const [toast, setToast] = useState<{ message: string; undo?: () => void }>(),
    [saveError, setSaveError] = useState("");
  const [draft, setDraft] = useState(""),
    [chatError, setChatError] = useState(""),
    [busy, setBusy] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState("");
  const [context, setContext] = useState<{
      quote: string;
      sourceId: string;
      page: number;
      anchorY?: number;
      rects?: Rect[];
    }>(),
    [selectedAnnotation, setSelectedAnnotation] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(false),
    [panelOpen, setPanelOpen] = useState(() => {
      try {
        return localStorage.getItem("nemodoc-assistant-open") === "true";
      } catch {
        return false;
      }
    });
  const [marginOffset, setMarginOffset] = useState(46);
  const readingArea = useRef<HTMLDivElement>(null);
  const [marginAnchor, setMarginAnchor] = useState<{
    sourceId: string;
    page: number;
    text: string;
  }>();
  const [passageScrollTarget, setPassageScrollTarget] = useState<string>();
  const trackPassage = useCallback((y: number) => {
    const area = readingArea.current?.getBoundingClientRect();
    if (area)
      setMarginOffset(Math.max(46, Math.min(area.height - 180, y - area.top)));
  }, []);
  const [answerMode, setAnswerMode] = useState<AnswerMode>("quick");
  const [topicNoteNext, setTopicNoteNext] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const chatDock = useRef<HTMLDivElement>(null),
    chatLauncher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    chatBottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController>(null),
    streaming = useRef(false);
  const activeNotebookRef = useRef(activeId);
  activeNotebookRef.current = activeId;
  const importingRef = useRef(false);
  const notebook = notebooks.find((n) => n.id === activeId);
  const savedAnswers = (notebook?.messages ?? []).flatMap((answer, index) => {
    if (answer.role !== "assistant" || !answer.savedToNotes) return [];
    const question = (notebook?.messages ?? [])
      .slice(0, index)
      .reverse()
      .find((message) => message.role === "user");
    return question ? [{ answer, question }] : [];
  });
  const activePassageNote = notebook?.passageNotes?.find((note) => note.active);
  const passageMessageIds = new Set(
    (notebook?.passageNotes ?? [])
      .filter((note) => !note.topic)
      .flatMap((note) => note.messages.map((message) => message.id)),
  );
  const generalConversationMessages = (notebook?.messages ?? []).filter(
    (message) => !passageMessageIds.has(message.id),
  );
  const panelMessages =
    activePassageNote?.messages ?? generalConversationMessages;
  const notebookSources = sources.filter((s) => s.notebookId === activeId);
  const source = notebookSources.find((s) => s.id === sourceId);
  const notebookAnnotations = annotations.filter((a) =>
    notebookSources.some((s) => s.id === a.sourceId),
  );
  const filteredAnnotations = notebookAnnotations
    .filter(
      (annotation) =>
        !annotationFilter ||
        `${annotation.quote} ${annotation.note} ${(annotation.tags ?? []).join(" ")} ${annotation.kind ?? "highlight"}`
          .toLowerCase()
          .includes(annotationFilter.toLowerCase()),
    )
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
  const activeAnnotation = notebookAnnotations.find(
    (a) => a.id === selectedAnnotation,
  );
  const enabledSources = notebookSources.filter((s) => enabled.has(s.id));
  const sidebarVisible = compactLayout ? sidebarOpen : !sidebarCollapsed;
  const closeSidebar = () => {
    returnSidebarFocus.current = true;
    if (compactLayout) setSidebarOpen(false);
    else setSidebarCollapsed(true);
  };
  const openConversation = () => {
    if (activePassageNote)
      setPassageNote(activeId, activePassageNote.id, (note) => ({
        ...note,
        active: false,
        collapsed: true,
      }));
    setMarginAnchor(undefined);
    setContext(undefined);
    setMarginOffset(46);
    setTab("chat");
    setPanelOpen(true);
  };
  useEffect(() => {
    if (compactLayout && sidebarVisible) sidebarCloser.current?.focus();
    else if (!sidebarVisible && returnSidebarFocus.current) {
      returnSidebarFocus.current = false;
      sidebarLauncher.current?.focus();
    }
  }, [compactLayout, sidebarVisible]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 960px)");
    const resize = () => {
      setCompactLayout(query.matches);
      setSidebarOpen(false);
    };
    query.addEventListener("change", resize);
    return () => query.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        "nemodoc-sidebar-collapsed",
        String(sidebarCollapsed),
      );
    } catch {
      /* Optional preference. */
    }
  }, [sidebarCollapsed]);
  const notify = (message: string, undo?: () => void) =>
    setToast({ message, undo });
  const reportStorageError = () => {
    setSaveError(
      "Browser storage is full or unavailable. Export your notes before refreshing.",
    );
  };
  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await storage.read();
      if (!saved.notebooks.length) {
        const demo = await createDemo();
        await storage.notebook(demo.notebook);
        for (const s of demo.sources) await storage.source(s);
        saved.notebooks = [demo.notebook];
        saved.sources = demo.sources;
      }
      if (!alive) return;
      setNotebooks(saved.notebooks);
      setSources(saved.sources);
      setAnnotations(saved.annotations);
      setArtifacts(saved.artifacts);
      let rememberedNotebook = "",
        rememberedSource = "";
      try {
        rememberedNotebook = localStorage.getItem("nemodoc-notebook") ?? "";
        rememberedSource = localStorage.getItem("nemodoc-source") ?? "";
      } catch {
        /* IndexedDB remains the primary store. */
      }
      const active =
        saved.notebooks.find((n) => n.id === rememberedNotebook)?.id ??
        saved.notebooks[0].id;
      setActiveId(active);
      setSourceId(
        saved.sources.find(
          (s) => s.notebookId === active && s.id === rememberedSource,
        )?.id ??
          saved.sources.find((s) => s.notebookId === active)?.id ??
          "",
      );
      const resumedSource =
        saved.sources.find(
          (s) => s.notebookId === active && s.id === rememberedSource,
        ) ?? saved.sources.find((s) => s.notebookId === active);
      setPage(resumedSource?.readingState?.page ?? 1);
      setEnabled(new Set(saved.sources.map((s) => s.id)));
      setReady(true);
    })().catch(() => {
      if (alive) {
        setSaveError(
          "Unable to open local storage. Allow site storage in your browser, then reload.",
        );
        setReady(true);
      }
    });
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
    return () => {
      alive = false;
      abort.current?.abort();
      featureAbort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("nemodoc-notebook", activeId);
      localStorage.setItem("nemodoc-source", sourceId);
    } catch {
      /* Reading remains available with localStorage disabled. */
    }
  }, [activeId, sourceId, ready]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(undefined),
      toast.undo ? 10000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (tab === "chat" && panelOpen)
      chatBottom.current?.scrollIntoView({ block: "nearest" });
  }, [notebook?.messages, tab, panelOpen]);
  useEffect(() => {
    if (!passageScrollTarget || tab !== "chat" || !panelOpen) return;
    document
      .getElementById(`chat-message-${passageScrollTarget}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    setPassageScrollTarget(undefined);
  }, [passageScrollTarget, notebook?.messages, tab, panelOpen]);
  useEffect(() => setSuggestionsOpen(false), [activeId]);
  useEffect(() => {
    if (!ready || !chatDock.current) return;
    const dock = chatDock.current;
    const measure = () =>
      dock
        .closest<HTMLElement>(".workspace")
        ?.style.setProperty(
          "--chat-dock-height",
          `${dock.getBoundingClientRect().height}px`,
        );
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    measure();
    return () => observer.disconnect();
  }, [ready]);
  useEffect(() => {
    if (!suggestionsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!chatDock.current?.contains(event.target as Node))
        setSuggestionsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSuggestionsOpen(false);
        chatDock.current
          ?.querySelector<HTMLButtonElement>(".composer-suggestions")
          ?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [suggestionsOpen]);
  const closeAssistant = () => {
    setPanelOpen(false);
    chatLauncher.current?.focus();
  };
  useEffect(() => {
    try {
      localStorage.setItem("nemodoc-assistant-open", String(panelOpen));
    } catch {
      /* Optional preference. */
    }
  }, [panelOpen]);
  const chooseSuggestion = (question: string) => {
    setDraft(question);
    setSuggestionsOpen(false);
    composer.current?.focus();
  };
  const updateNotebook = (value: Notebook) => {
    setNotebooks((list) => list.map((n) => (n.id === value.id ? value : n)));
    void storage.notebook(value).catch(reportStorageError);
  };
  const openNotebook = (id: string) => {
    abort.current?.abort();
    setActiveId(id);
    const resumed = sources.find((s) => s.notebookId === id);
    setSourceId(resumed?.id ?? "");
    setPage(resumed?.readingState?.page ?? 1);
    setCompareId("");
    setVisual(undefined);
    setEvidence(undefined);
    featureAbort.current?.abort();
    setContext(undefined);
    setSelectedAnnotation(undefined);
    setChatError("");
    setSidebarOpen(false);
    setModal(null);
  };
  const openSource = (id: string, pageNumber?: number) => {
    setMarginAnchor(undefined);
    setMarginOffset(46);
    setSourceId(id);
    setPage(
      pageNumber ?? sources.find((s) => s.id === id)?.readingState?.page ?? 1,
    );
    setNavigationKey((key) => key + 1);
    setContext(undefined);
    setSidebarOpen(false);
    setEvidence(undefined);
  };
  const showCitation = (c: Citation) => {
    if (!sources.some((s) => s.id === c.sourceId)) {
      notify("This source has been removed from the notebook.");
      return;
    }
    openSource(c.sourceId, c.page);
    setMarginAnchor({ sourceId: c.sourceId, page: c.page, text: c.text });
    setEvidence({ page: c.page, text: c.text, key: Date.now() });
  };
  const saveArtifact = (a: StudyArtifact) => {
    setArtifacts((list) =>
      list.some((x) => x.id === a.id)
        ? list.map((x) => (x.id === a.id ? a : x))
        : [...list, a],
    );
    void storage.artifact(a).catch(reportStorageError);
  };
  const deleteArtifact = (id: string) => {
    const value = artifacts.find((a) => a.id === id);
    setArtifacts((list) => list.filter((a) => a.id !== id));
    void storage.removeArtifact(id).catch(reportStorageError);
    if (value) notify("Study material deleted", () => saveArtifact(value));
  };
  const recognizePage = async (
    target: Source,
    number: number,
    image: string,
  ) => {
    if (ocrBusy) return;
    const controller = new AbortController();
    featureAbort.current = controller;
    setOcrBusy(true);
    setOcrError("");
    try {
      const result = await apiJSON<{
        text: string;
        regions: (import("./types").Rect & { text: string })[];
      }>("/api/ocr", { image }, controller.signal);
      // Merge into the latest source to retain bookmarks and navigation saved during OCR.
      setSources((list) =>
        list.map((s) => {
          if (s.id !== target.id) return s;
          const pages = [...s.pages];
          const old = s.ocr?.[number]?.text;
          const original = old
            ? pages[number - 1].replace(old, "").trim()
            : pages[number - 1];
          pages[number - 1] = [original, result.text]
            .filter(Boolean)
            .join("\n\n");
          const updated = { ...s, pages, ocr: { ...s.ocr, [number]: result } };
          void storage.source(updated).catch(reportStorageError);
          return updated;
        }),
      );
      notify("Page text recognized, saved, and ready to search.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setOcrError((e as Error).message);
    } finally {
      setOcrBusy(false);
    }
  };
  const askImage = (target: Source, number: number, image: string) => {
    setVisual({ image, sourceId: target.id, page: number });
    setContext(undefined);
    setTab("chat");
    setPanelOpen(true);
    setDraft("Explain the chart, table, or diagram on this page.");
    setTimeout(() => composer.current?.focus(), 80);
  };
  const changeAnnotations = (next: Annotation[], mergeKey = "") => {
    if (
      !mergeKey ||
      lastEdit.current.key !== mergeKey ||
      Date.now() - lastEdit.current.time > 800
    ) {
      undoStack.current.push(annotations);
      if (undoStack.current.length > 100) undoStack.current.shift();
    }
    lastEdit.current = { key: mergeKey, time: Date.now() };
    redoStack.current = [];
    void storage
      .replaceAnnotations(annotations, next)
      .catch(reportStorageError);
    setAnnotations(next);
    setHistoryVersion((v) => v + 1);
  };
  const undoAnnotation = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(annotations);
    void storage
      .replaceAnnotations(annotations, previous)
      .catch(reportStorageError);
    setAnnotations(previous);
    lastEdit.current.key = "";
    setHistoryVersion((v) => v + 1);
  };
  const redoAnnotation = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(annotations);
    void storage
      .replaceAnnotations(annotations, next)
      .catch(reportStorageError);
    setAnnotations(next);
    setHistoryVersion((v) => v + 1);
  };
  const updateSource = (value: Source) => {
    setSources((list) => list.map((s) => (s.id === value.id ? value : s)));
    void storage.source(value).catch(reportStorageError);
  };
  const addAnnotation = (value: Annotation) => {
    changeAnnotations([...annotations, value]);
    setNotesView("highlights");
    notify("Highlight saved to your notebook");
  };
  const editAnnotation = (value: Annotation) => {
    changeAnnotations(
      annotations.map((a) => (a.id === value.id ? value : a)),
      value.id,
    );
  };
  const selectAnnotation = (value: Annotation) => {
    setSelectedAnnotation(value.id);
    setNotesView("highlights");
    setTab("notes");
    setPanelOpen(true);
  };
  const askSelection = (
    quote: string,
    selectedPage: number,
    question?: string,
    anchorY?: number,
    rects?: Rect[],
  ) => {
    if (!source) return;
    const selected = {
      quote,
      page: selectedPage,
      sourceId: source.id,
      anchorY,
      rects,
    };
    if (question) {
      void send(question, undefined, selected);
      return;
    }
    setContext(selected);
    setTab("chat");
    setDraft("");
    setTimeout(() => composer.current?.focus(), 0);
  };
  const addFiles = async (files: FileList | File[]) => {
    if (!notebook || importingRef.current) return;
    importingRef.current = true;
    const targetNotebook = notebook.id;
    for (const file of Array.from(files)) {
      try {
        const imported = await importDocument(
          file,
          targetNotebook,
          setImporting,
        );
        await storage.source(imported);
        setSources((list) => [...list, imported]);
        setEnabled((prev) => new Set([...prev, imported.id]));
        if (activeNotebookRef.current === targetNotebook) {
          setSourceId(imported.id);
          setPage(1);
        }
        notify(`${file.name} added`);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Could not import this document.",
        );
      }
    }
    setImporting("");
    importingRef.current = false;
    if (input.current) input.current.value = "";
  };
  const createNotebook = async () => {
    if (!title.trim()) return;
    const value: Notebook = {
      id: crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      createdAt: Date.now(),
      notes: "",
      messages: [],
    };
    try {
      await storage.notebook(value);
      setNotebooks((list) => [...list, value]);
      setActiveId(value.id);
      setSourceId("");
      setPage(1);
      setTitle("");
      setDescription("");
      setModal(null);
      setContext(undefined);
      setChatError("");
      setSidebarOpen(false);
    } catch {
      reportStorageError();
    }
  };
  const removeSource = async (value: Source) => {
    const savedAnnotations = annotations.filter((a) => a.sourceId === value.id);
    const savedPassageNotes =
      notebooks
        .find((item) => item.id === value.notebookId)
        ?.passageNotes?.filter((note) => note.sourceId === value.id) ?? [];
    try {
      await apiJSON("/api/agent/sources/revoke", {
        id: value.id,
        notebookId: value.notebookId,
      });
      await storage.removeSource(value.id);
      setSources((list) => list.filter((s) => s.id !== value.id));
      setAnnotations((list) => list.filter((a) => a.sourceId !== value.id));
      setNotebooks((list) =>
        list.map((item) => {
          if (item.id !== value.notebookId) return item;
          const updated = {
            ...item,
            passageNotes: (item.passageNotes ?? []).filter(
              (note) => note.sourceId !== value.id,
            ),
          };
          void storage.notebook(updated).catch(reportStorageError);
          return updated;
        }),
      );
      undoStack.current = [];
      redoStack.current = [];
      setHistoryVersion((v) => v + 1);
      if (compareId === value.id) setCompareId("");
      if (sourceId === value.id)
        openSource(notebookSources.find((s) => s.id !== value.id)?.id ?? "");
      notify("Source removed; agent access revoked", () => {
        void (async () => {
          await storage.source(value);
          for (const a of savedAnnotations) await storage.annotation(a);
          setSources((list) => [...list, value]);
          setAnnotations((list) => [...list, ...savedAnnotations]);
          setNotebooks((list) =>
            list.map((item) => {
              if (item.id !== value.notebookId) return item;
              const known = new Set(
                (item.passageNotes ?? []).map((note) => note.id),
              );
              const updated = {
                ...item,
                passageNotes: [
                  ...(item.passageNotes ?? []),
                  ...savedPassageNotes
                    .filter((note) => !known.has(note.id))
                    .map((note) => ({
                      ...note,
                      active: false,
                      collapsed: true,
                    })),
                ],
              };
              void storage.notebook(updated).catch(reportStorageError);
              return updated;
            }),
          );
        })().catch(reportStorageError);
        setToast(undefined);
      });
    } catch {
      reportStorageError();
    }
  };
  const removeAnnotation = async (value: Annotation) => {
    try {
      changeAnnotations(annotations.filter((a) => a.id !== value.id));
      setSelectedAnnotation(undefined);
      notify("Highlight removed", () => {
        addAnnotation(value);
      });
    } catch {
      reportStorageError();
    }
  };
  const backupNotebook = async () => {
    if (!notebook) return;
    try {
      const blob = await createBackup({
        notebooks: [notebook],
        sources: notebookSources,
        annotations: notebookAnnotations,
        artifacts: artifacts.filter((a) => a.notebookId === notebook.id),
      });
      download(
        blob,
        `${notebook.title.replace(/[^\p{L}\p{N} -]/gu, "") || "Notebook"} - backup.zip`,
      );
      notify("Complete notebook backup downloaded");
    } catch {
      notify("Unable to create this backup. Try again.");
    }
  };
  const restoreNotebook = async (file: File) => {
    try {
      const restored = await readBackup(file);
      await storage.restore(restored);
      setNotebooks((list) => [...list, ...restored.notebooks]);
      setSources((list) => [...list, ...restored.sources]);
      setAnnotations((list) => [...list, ...restored.annotations]);
      setArtifacts((list) => [...list, ...restored.artifacts]);
      setEnabled(
        (prev) => new Set([...prev, ...restored.sources.map((s) => s.id)]),
      );
      notify(`${restored.notebooks.length} notebook restored`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not restore this backup.");
    }
    if (backupInput.current) backupInput.current.value = "";
  };
  const exportNotes = () => {
    if (!notebook) return;
    const text = exportNotebookNotes(
      notebook,
      notebookAnnotations,
      notebookSources,
    );
    download(
      new Blob([text], { type: "text/markdown" }),
      `${notebook.title.replace(/[^\p{L}\p{N} -]/gu, "") || "Notebook"} - notes.md`,
    );
    notify("Notebook notes exported");
  };
  const saveAnswer = (answerId: string) => {
    if (!notebook || answerId === streamingMessageId) return;
    const target = notebook.id;
    setNotebooks((list) =>
      list.map((current) => {
        if (current.id !== target) return current;
        const saved = saveAnswerToNotes(
          current.notes,
          current.messages,
          answerId,
          sources.filter((source) => source.notebookId === target),
        );
        if (!saved) return current;
        const updated = {
          ...current,
          ...saved,
          passageNotes: (current.passageNotes ?? []).map((note) => ({
            ...note,
            messages: note.messages.map((message) =>
              message.id === answerId
                ? { ...message, savedToNotes: true }
                : message,
            ),
          })),
        };
        void storage.notebook(updated).catch(reportStorageError);
        return updated;
      }),
    );
  };
  const setPassageNote = (
    notebookId: string,
    noteId: string,
    change: (note: PassageNote) => PassageNote,
  ) => {
    setNotebooks((list) =>
      list.map((current) => {
        if (current.id !== notebookId) return current;
        const updated = {
          ...current,
          passageNotes: (current.passageNotes ?? []).map((note) =>
            note.id === noteId ? change(note) : note,
          ),
        };
        void storage.notebook(updated).catch(reportStorageError);
        return updated;
      }),
    );
  };
  const openPassageNote = (id: string) => {
    if (!notebook) return;
    const selected = notebook.passageNotes?.find((note) => note.id === id);
    if (!selected) return;
    const knownMessages = new Set(
      notebook.messages.map((message) => message.id),
    );
    const legacyMessages = selected.messages.filter(
      (message) => !knownMessages.has(message.id),
    );
    const updated = {
      ...notebook,
      messages: [...notebook.messages, ...legacyMessages],
      passageNotes: (notebook.passageNotes ?? []).map((note) => ({
        ...note,
        active: note.id === id,
        collapsed: true,
      })),
    };
    updateNotebook(updated);
    openSource(selected.sourceId, selected.page);
    setMarginAnchor({
      sourceId: selected.sourceId,
      page: selected.page,
      text: selected.quote,
    });
    setTab("chat");
    setPanelOpen(true);
    const answer = [...selected.messages]
      .reverse()
      .find((message) => message.role === "assistant");
    setPassageScrollTarget(answer?.id);
  };
  const sendPassage = async (
    question: string,
    selected: NonNullable<typeof context>,
    existing?: PassageNote,
    replaceMessageIds: string[] = [],
  ) => {
    if (!notebook || streaming.current) return;
    setChatError("");
    setRetrievalInfo("");
    const target = notebook.id;
    const noteId = existing?.id ?? crypto.randomUUID();
    const replaced = new Set(replaceMessageIds);
    const user: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };
    const answer: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      citations: [],
      incomplete: true,
    };
    const baseMessages = existing?.messages ?? [];
    const nextNote: PassageNote = {
      id: noteId,
      sourceId: selected.sourceId,
      page: selected.page,
      quote: selected.quote,
      rects: selected.rects ?? existing?.rects ?? [],
      question: existing?.question ?? question,
      answerMode: existing?.answerMode ?? answerMode,
      model: status.model,
      messages: [...baseMessages, user, answer],
      createdAt: existing?.createdAt ?? Date.now(),
      // Keep the user's chosen size, but let each new passage return to the
      // reader margin. A prior screen position may cover a Book spread or be
      // outside the current viewport after a resize.
      card:
        existing?.card ??
        (activePassageNote?.card
          ? {
              width: activePassageNote.card.width,
              height: activePassageNote.card.height,
            }
          : undefined),
      active: true,
      collapsed: true,
    };
    const originalMessages = notebook.messages.filter(
      (message) => !replaced.has(message.id),
    );
    const messages = [...originalMessages, user, answer];
    const initial = {
      ...notebook,
      messages: mergeStreamMessages(originalMessages, messages),
      passageNotes: [
        ...(notebook.passageNotes ?? [])
          .filter((note) => note.id !== noteId)
          .map((note) => ({ ...note, active: false, collapsed: true })),
        nextNote,
      ],
    };
    updateNotebook(initial);
    setMarginAnchor({
      sourceId: selected.sourceId,
      page: selected.page,
      text: selected.quote,
    });
    if (selected.anchorY !== undefined) trackPassage(selected.anchorY);
    setContext(undefined);
    setDraft("");
    setPanelOpen(true);
    setTab("chat");
    setBusy(true);
    streaming.current = true;
    setStreamingMessageId(answer.id);
    abort.current = new AbortController();
    const refresh = () =>
      setNotebooks((list) =>
        list.map((current) => {
          if (current.id !== target) return current;
          const next = {
            ...current,
            messages: mergeStreamMessages(
              current.messages.filter((message) => !replaced.has(message.id)),
              messages,
            ),
            passageNotes: (current.passageNotes ?? []).map((note) =>
              note.id === noteId
                ? {
                    ...note,
                    messages: mergeStreamMessages(note.messages, [
                      ...baseMessages,
                      user,
                      answer,
                    ]),
                  }
                : note,
            ),
          };
          void storage.notebook(next).catch(reportStorageError);
          return next;
        }),
      );
    try {
      const selectedSource = sources.find(
        (item) => item.id === selected.sourceId,
      );
      await streamChat(
        {
          question,
          answerMode: nextNote.answerMode,
          selection: {
            sourceId: selected.sourceId,
            page: selected.page,
            quote: selected.quote.slice(0, 16000),
          },
          history: baseMessages
            .filter((message) => message.content && !message.incomplete)
            .slice(-12)
            .map(({ role, content }) => ({
              role,
              content: content.slice(0, 16000),
            })),
          sources: selectedSource
            ? [
                {
                  id: selectedSource.id,
                  name: selectedSource.name,
                  pages: selectedSource.pages,
                },
              ]
            : [],
        },
        abort.current.signal,
        (text) => {
          answer.content += text;
          refresh();
        },
        (citations) => {
          answer.citations = citations;
          refresh();
        },
        (info) =>
          setRetrievalInfo(info.warning || `Sources retrieved by ${info.mode}`),
      );
      answer.incomplete = false;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        answer.cancelled = true;
      } else {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to answer this passage question.";
        answer.error = message;
        if (!message.toLowerCase().includes("selection could not be matched"))
          setChatError(message);
      }
    } finally {
      refresh();
      setBusy(false);
      streaming.current = false;
      setStreamingMessageId("");
    }
  };
  const deletePassageNote = (noteId: string) => {
    if (!notebook) return;
    const removed = notebook.passageNotes?.find((note) => note.id === noteId);
    if (!removed) return;
    const messageIds = new Set(removed.messages.map((message) => message.id));
    const removedMessages = notebook.messages.filter((message) =>
      messageIds.has(message.id),
    );
    const originalOrder = new Map(
      notebook.messages.map((message, index) => [message.id, index]),
    );
    const noteIndex = (notebook.passageNotes ?? []).findIndex(
      (note) => note.id === noteId,
    );
    const updated = {
      ...notebook,
      messages: notebook.messages.filter(
        (message) => !messageIds.has(message.id),
      ),
      passageNotes: (notebook.passageNotes ?? []).filter(
        (note) => note.id !== noteId,
      ),
    };
    updateNotebook(updated);
    if (activePassageNote?.id === noteId) setMarginAnchor(undefined);
    notify("Passage and answer deleted", () =>
      setNotebooks((list) =>
        list.map((current) => {
          if (current.id !== notebook.id) return current;
          if ((current.passageNotes ?? []).some((note) => note.id === noteId))
            return current;
          const currentOrder = new Map(
            current.messages.map((message, index) => [message.id, index]),
          );
          const messages = [...current.messages, ...removedMessages].sort(
            (left, right) => {
              const leftOrder =
                originalOrder.get(left.id) ??
                notebook.messages.length + (currentOrder.get(left.id) ?? 0);
              const rightOrder =
                originalOrder.get(right.id) ??
                notebook.messages.length + (currentOrder.get(right.id) ?? 0);
              return leftOrder - rightOrder;
            },
          );
          const passageNotes = [...(current.passageNotes ?? [])];
          passageNotes.splice(
            Math.min(noteIndex, passageNotes.length),
            0,
            removed,
          );
          const next = { ...current, messages, passageNotes };
          void storage.notebook(next).catch(reportStorageError);
          return next;
        }),
      ),
    );
  };
  const regeneratePassage = (noteId: string, answerId: string) => {
    if (!notebook || streaming.current) return;
    const note = notebook.passageNotes?.find((item) => item.id === noteId);
    if (!note) return;
    const answerIndex = note.messages.findIndex(
      (message) => message.id === answerId,
    );
    if (answerIndex < 0) return;
    const question = note.messages
      .slice(0, answerIndex)
      .reverse()
      .find((message) => message.role === "user");
    if (!question) return;
    const replaceMessageIds = [question.id, answerId];
    const reset = {
      ...note,
      messages: note.messages.filter(
        (message) => !replaceMessageIds.includes(message.id),
      ),
      active: true,
      collapsed: true,
    };
    void sendPassage(
      question.content,
      {
        sourceId: note.sourceId,
        page: note.page,
        quote: note.quote,
        rects: note.rects,
      },
      reset,
      replaceMessageIds,
    );
  };
  const send = async (
    question = draft,
    onlySources?: Source[],
    selected = context,
  ) => {
    if (!notebook || !question.trim() || streaming.current) return;
    if (selected && !onlySources) {
      await sendPassage(question.trim(), selected);
      return;
    }
    if (
      !enabledSources.length &&
      !selected &&
      !visual &&
      !onlySources?.length
    ) {
      setChatError("Select at least one source in the sidebar first.");
      return;
    }
    openConversation();
    const target = notebook.id;
    setMarginAnchor(
      selected
        ? {
            sourceId: selected.sourceId,
            page: selected.page,
            text: selected.quote,
          }
        : undefined,
    );
    if (selected?.anchorY !== undefined) trackPassage(selected.anchorY);
    else setMarginOffset(46);
    const fullQuestion =
      selected && !onlySources
        ? `${question}\n\nSelected passage from ${sources.find((s) => s.id === selected.sourceId)?.name}, page ${selected.page}:\n${selected.quote}`
        : question;
    const selectedSources =
      onlySources ??
      (selected
        ? notebookSources.filter((s) => s.id === selected.sourceId)
        : enabledSources);
    const imageQuestion = onlySources ? undefined : visual;
    const user: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: fullQuestion,
    };
    const answer: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      incomplete: true,
      content: "",
      citations: [],
      showPages: wantsPages(question),
    };
    const originalMessages = notebook.messages;
    const messages = [...originalMessages, user, answer];
    const refresh = () =>
      setNotebooks((list) =>
        list.map((n) => {
          if (n.id !== target) return n;
          return {
            ...n,
            messages: mergeStreamMessages(n.messages, messages),
          };
        }),
      );
    setDraft("");
    setSuggestionsOpen(false);
    setTab("chat");
    setPanelOpen(true);
    setContext(undefined);
    setVisual(undefined);
    setRetrievalInfo("");
    setChatError("");
    setBusy(true);
    streaming.current = true;
    setStreamingMessageId(answer.id);
    abort.current = new AbortController();
    refresh();
    try {
      const requestedPage = !imageQuestion
        ? explicitPage(question, selectedSources)
        : undefined;
      if (requestedPage && pageOnlyRequest(question)) {
        answer.citations = [requestedPage];
        answer.showPages = true;
        answer.content = `${requestedPage.sourceName} · ${selectedSources.find((s) => s.id === requestedPage.sourceId)?.kind === "pptx" ? "Slide" : "Page"} ${requestedPage.page} [1]`;
        refresh();
      } else if (imageQuestion) {
        const result = await apiJSON<{ content: string }>(
          "/api/vision",
          {
            image: imageQuestion.image,
            question: `${question}\n\n${answerMode === "quick" ? "Give a concise answer." : "Give a detailed, structured explanation."}`,
          },
          abort.current.signal,
        );
        const imageSource = notebookSources.find(
          (s) => s.id === imageQuestion.sourceId,
        );
        answer.content = result.content + "\n\n[1]";
        answer.citations = [
          {
            id: 1,
            sourceId: imageQuestion.sourceId,
            sourceName: imageSource?.name ?? "Page image",
            page: imageQuestion.page,
            text: imageSource?.pages[imageQuestion.page - 1] || "",
          },
        ];
        refresh();
      } else {
        if (requestedPage) answer.showPages = true;
        await streamChat(
          {
            question,
            answerMode,
            selection:
              selected && !requestedPage
                ? {
                    sourceId: selected.sourceId,
                    page: selected.page,
                    quote: selected.quote.slice(0, 16000),
                  }
                : undefined,
            history: generalConversationMessages
              .filter((m) => m.content && !m.incomplete)
              .slice(-12)
              .map(({ role, content }) => ({
                role,
                content: content.slice(0, 16000),
              })),
            sources: selectedSources
              .filter((s) => !requestedPage || s.id === requestedPage.sourceId)
              .map(({ id, name, pages }) => ({
                id,
                name,
                // Empty other slots to preserve the original one-based page
                // number while limiting numbered-page Q&A to its requested text.
                pages: requestedPage
                  ? pages.map((text, index) =>
                      index === requestedPage.page - 1 ? text : "",
                    )
                  : pages,
              })),
          },
          abort.current.signal,
          (text) => {
            answer.content += text;
            refresh();
          },
          (citations) => {
            answer.citations = citations;
            refresh();
          },
          (info) =>
            setRetrievalInfo(
              info.warning || `Sources retrieved by ${info.mode}`,
            ),
        );
      }
      answer.incomplete = false;
      // A source-grounded topic question becomes an independent note only
      // after the model has actually cited a source/page that exists. Keep the
      // same turn in the whole-notebook conversation as well.
      if (topicNoteNext && !selected && !onlySources && !imageQuestion) {
        const anchor = answer.citations?.find((citation) => {
          const candidate = selectedSources.find(
            (item) => item.id === citation.sourceId,
          );
          return (
            candidate &&
            citation.page > 0 &&
            citation.page <= candidate.pages.length &&
            usesCitation(answer.content, citation, answer.citations ?? [])
          );
        });
        if (anchor) {
          const noteId = crypto.randomUUID();
          setNotebooks((list) =>
            list.map((current) => {
              if (current.id !== target) return current;
              const topicNote: PassageNote = {
                id: noteId,
                sourceId: anchor.sourceId,
                page: anchor.page,
                quote: anchor.text,
                rects: [],
                question,
                answerMode,
                model: status.model,
                messages: [{ ...user, content: question }, { ...answer }],
                createdAt: Date.now(),
                topic: true,
                active: true,
                collapsed: false,
              };
              return {
                ...current,
                passageNotes: [
                  ...(current.passageNotes ?? []).map((note) => ({
                    ...note,
                    active: false,
                    collapsed: true,
                  })),
                  topicNote,
                ],
              };
            }),
          );
          openSource(anchor.sourceId, anchor.page);
          setMarginAnchor({
            sourceId: anchor.sourceId,
            page: anchor.page,
            text: anchor.text,
          });
          setTopicNoteNext(false);
        }
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        setChatError(
          error instanceof Error
            ? error.message
            : "Unable to send this question.",
        );
      if (!answer.content) messages.pop();
    } finally {
      refresh();
      // Merge into the current notebook so notes edited during streaming remain intact.
      setNotebooks((list) =>
        list.map((n) => {
          if (n.id !== target) return n;
          const updated = {
            ...n,
            messages: mergeStreamMessages(n.messages, messages),
          };
          void storage.notebook(updated).catch(reportStorageError);
          return updated;
        }),
      );
      setBusy(false);
      streaming.current = false;
      setStreamingMessageId("");
    }
  };
  if (!ready)
    return (
      <div className="boot">
        <Brand />
        <span>Making room for your ideas…</span>
      </div>
    );
  return (
    <div
      className={`app ${sidebarOpen ? "sidebar-open" : ""} ${panelOpen ? "" : "panel-hidden"}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          void addFiles(e.dataTransfer.files);
        }
      }}
    >
      <input
        ref={backupInput}
        type="file"
        accept=".zip"
        className="sr-only"
        aria-label="Restore notebook backup"
        onChange={(e) => {
          if (e.target.files?.[0]) void restoreNotebook(e.target.files[0]);
        }}
      />
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".pdf,.pptx"
        multiple
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
        }}
        aria-label="Upload sources"
      />
      {compactLayout && sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Dismiss sidebar"
          onClick={closeSidebar}
        />
      )}
      <aside
        className="sidebar"
        id="notebook-sidebar"
        aria-label="Notebook sidebar"
        hidden={!sidebarVisible}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeSidebar();
          }
        }}
      >
        <div className="sidebar-brand">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setModal("library");
            }}
          >
            <Brand />
            <strong>
              Nemo<span>Doc</span>
            </strong>
          </a>
          <button
            className="icon-button"
            ref={sidebarCloser}
            aria-label="Close sidebar"
            title="Close sidebar"
            onClick={closeSidebar}
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <button className="nav-item" onClick={() => setModal("library")}>
          <Grid2X2 size={17} />
          All notebooks<span>{notebooks.length}</span>
        </button>
        <div className="sidebar-section-heading">
          <span>SOURCES</span>
          <span>{notebookSources.length}</span>
        </div>
        <button
          className="add-source"
          disabled={!!importing || !notebook}
          onClick={() => input.current?.click()}
        >
          {importing ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Plus size={16} />
          )}
          Add source
        </button>
        <label className="source-search">
          <Search size={14} />
          <input
            aria-label="Filter sources"
            placeholder="Find a source…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <span>⌕</span>
        </label>
        {notebookSources.length > 0 && (
          <label className="select-all">
            <input
              type="checkbox"
              checked={enabledSources.length === notebookSources.length}
              onChange={(e) =>
                setEnabled((prev) => {
                  const next = new Set(prev);
                  notebookSources.forEach((s) => {
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                  });
                  return next;
                })
              }
            />
            <span>Select all sources</span>
          </label>
        )}
        <div className="source-list">
          {notebookSources
            .filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))
            .map((s) => (
              <div
                key={s.id}
                className={`source-row ${sourceId === s.id ? "active" : ""}`}
              >
                <input
                  type="checkbox"
                  aria-label={`Use ${s.name} in chat`}
                  checked={enabled.has(s.id)}
                  onChange={(e) =>
                    setEnabled((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(s.id);
                      else next.delete(s.id);
                      return next;
                    })
                  }
                />
                <button
                  className="source-open"
                  onClick={() => openSource(s.id)}
                >
                  <span className={`source-document-icon ${s.kind}`}>
                    <FileText size={17} />
                  </span>
                  <span>
                    <strong>{s.name.replace(/\.(pdf|pptx)$/i, "")}</strong>
                    <small>
                      {s.kind.toUpperCase()} · {s.pages.length}{" "}
                      {s.kind === "pptx" ? "slides" : "pages"}
                    </small>
                  </span>
                </button>
                <button
                  className="source-remove icon-button small"
                  aria-label={`Remove ${s.name}`}
                  title="Remove source"
                  onClick={() => void removeSource(s)}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          {!notebookSources.length && (
            <div className="source-empty">
              <Layers size={25} strokeWidth={1.3} />
              <p>Your ideas start here.</p>
              <span>
                Drop a PDF or slide deck
                <br />
                anywhere in this workspace.
              </span>
            </div>
          )}
        </div>
        <div className="sidebar-spacer" />
        <div className="sidebar-bottom">
          <button
            aria-label="Help and shortcuts"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={17} />
            Help & shortcuts
          </button>
        </div>
      </aside>
      <main className="workspace" inert={compactLayout && sidebarOpen}>
        <header className="workspace-header">
          <div className="breadcrumbs">
            <button
              className="icon-button sidebar-toggle"
              hidden={sidebarVisible && !compactLayout}
              ref={sidebarLauncher}
              aria-label={sidebarVisible ? "Hide sidebar" : "Open sidebar"}
              title={sidebarVisible ? "Hide sidebar" : "Open sidebar"}
              aria-expanded={sidebarVisible}
              aria-controls="notebook-sidebar"
              onClick={() => {
                if (sidebarVisible) closeSidebar();
                else if (compactLayout) setSidebarOpen(true);
                else setSidebarCollapsed(false);
              }}
            >
              {sidebarVisible ? (
                <PanelLeftClose size={19} />
              ) : (
                <PanelLeftOpen size={19} />
              )}
            </button>
            <span>My notebooks</span>
            <ChevronRight size={13} />
            <button
              className="notebook-title"
              title="All notebooks"
              onClick={() => setModal("library")}
            >
              <h1>{notebook?.title ?? "Welcome"}</h1>
            </button>
          </div>
          <WorkspaceTabs
            active={tab}
            open={panelOpen}
            onSelect={(value) => {
              if (value === "chat") {
                openConversation();
                return;
              }
              setTab(value);
              setPanelOpen(true);
            }}
          />
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="Search ideas"
              title="Search ideas"
              disabled={!enabledSources.length}
              onClick={() => setSearchNotebook(true)}
            >
              <Search size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={compareId ? "Close comparison" : "Compare sources"}
              title={compareId ? "Close comparison" : "Compare sources"}
              disabled={notebookSources.length < 2}
              onClick={() => {
                if (compareId) setCompareId("");
                else {
                  const second = notebookSources.find((s) => s.id !== sourceId);
                  if (second) {
                    setCompareId(second.id);
                    setComparePage(second.readingState?.page ?? 1);
                    setPanelOpen(false);
                  }
                }
              }}
            >
              <Layers size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="New notebook"
              title="New notebook"
              disabled={busy}
              onClick={() => setModal("new")}
            >
              <Plus size={18} />
            </button>
            <NotebookActions
              disabled={!notebook}
              onExport={exportNotes}
              onBackup={() => void backupNotebook()}
              onRestore={() => backupInput.current?.click()}
            />
            <button
              className="subtle-button settings-launcher"
              aria-label="Settings"
              title="Settings"
              onClick={() => setModal("settings")}
            >
              <Settings2 size={16} />
              <span>Settings</span>
            </button>
          </div>
        </header>
        {saveError && (
          <div className="storage-error" role="alert">
            {saveError}
          </div>
        )}
        <div
          ref={readingArea}
          className={[
            "work-area",
            compareId && "comparing",
            tab === "chat" &&
              (activePassageNote || marginAnchor) &&
              "has-passage-context",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="reading-workspace">
            {compareId && (
              <div className="comparison-controls">
                <label>
                  Left
                  <select
                    aria-label="Left comparison source"
                    value={sourceId}
                    onChange={(e) => openSource(e.target.value)}
                  >
                    {notebookSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Right
                  <select
                    aria-label="Right comparison source"
                    value={compareId}
                    onChange={(e) => {
                      setCompareId(e.target.value);
                      setComparePage(1);
                    }}
                  >
                    {notebookSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary-button"
                  disabled={busy || sourceId === compareId}
                  onClick={() => {
                    const pair = notebookSources.filter(
                      (s) => s.id === sourceId || s.id === compareId,
                    );
                    setVisual(undefined);
                    setContext(undefined);
                    setTab("chat");
                    setPanelOpen(true);
                    void send(
                      "Compare these two sources. Explain agreements, differences, and complementary ideas, citing both sources.",
                      pair,
                    );
                  }}
                >
                  Compare ideas
                </button>
              </div>
            )}
            {ocrBusy && (
              <div className="ocr-progress" role="status">
                <LoaderCircle className="spin" size={14} />
                Recognizing page text…
                <button
                  aria-label="Cancel OCR"
                  onClick={() => featureAbort.current?.abort()}
                >
                  Cancel
                </button>
              </div>
            )}
            {ocrError && (
              <div className="form-error" role="alert">
                {ocrError}
                <button
                  className="icon-button small"
                  aria-label="Dismiss OCR error"
                  onClick={() => setOcrError("")}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="readers-grid">
              <Reader
                source={source}
                annotations={annotations}
                page={page}
                navigationKey={navigationKey}
                setPage={setPage}
                onAnnotate={addAnnotation}
                onAsk={askSelection}
                answerMode={answerMode}
                onAnswerMode={setAnswerMode}
                askingBusy={busy}
                passageAnchor={marginAnchor}
                passageNotes={notebook?.passageNotes}
                onOpenPassageNote={openPassageNote}
                onPassagePosition={trackPassage}
                onSelectAnnotation={selectAnnotation}
                onUpload={() => input.current?.click()}
                onUpdateSource={updateSource}
                onUndo={undoAnnotation}
                onRedo={redoAnnotation}
                canUndo={undoStack.current.length > 0}
                canRedo={redoStack.current.length > 0}
                evidence={evidence}
                onOCR={(number, image) => {
                  if (source) void recognizePage(source, number, image);
                }}
                onVisual={(number, image) => {
                  if (source) askImage(source, number, image);
                }}
              />
              {compareId && (
                <Reader
                  source={notebookSources.find((s) => s.id === compareId)}
                  annotations={annotations}
                  page={comparePage}
                  navigationKey={0}
                  setPage={setComparePage}
                  onAnnotate={addAnnotation}
                  onAsk={(quote, number, question, anchorY, rects) => {
                    const selected = {
                      quote,
                      page: number,
                      sourceId: compareId,
                      anchorY,
                      rects,
                    };
                    if (question) {
                      void send(question, undefined, selected);
                      return;
                    }
                    setContext(selected);
                    setTab("chat");
                    composer.current?.focus();
                  }}
                  answerMode={answerMode}
                  onAnswerMode={setAnswerMode}
                  askingBusy={busy}
                  passageAnchor={marginAnchor}
                  passageNotes={notebook?.passageNotes}
                  onOpenPassageNote={openPassageNote}
                  onPassagePosition={trackPassage}
                  onSelectAnnotation={selectAnnotation}
                  onUpload={() => input.current?.click()}
                  onUpdateSource={updateSource}
                  keyboardEnabled={false}
                  onOCR={(number, image) => {
                    const second = notebookSources.find(
                      (s) => s.id === compareId,
                    );
                    if (second) void recognizePage(second, number, image);
                  }}
                  onVisual={(number, image) => {
                    const second = notebookSources.find(
                      (s) => s.id === compareId,
                    );
                    if (second) askImage(second, number, image);
                  }}
                />
              )}
            </div>
          </div>
          <AssistantPanel
            key={activeId}
            id="notebook-assistant"
            data-view={tab}
            data-context-answer={
              tab === "chat" && (activePassageNote || marginAnchor)
                ? "true"
                : undefined
            }
            offset={tab === "chat" ? marginOffset : 46}
            geometry={activePassageNote?.card}
            geometryKey={activePassageNote?.id ?? `${activeId}:${tab}`}
            movable={Boolean(activePassageNote)}
            resizable={Boolean(activePassageNote)}
            onGeometryChange={(card) => {
              if (activePassageNote)
                setPassageNote(activeId, activePassageNote.id, (note) => ({
                  ...note,
                  card,
                }));
            }}
            onClose={() => {
              if (activePassageNote) {
                setPassageNote(activeId, activePassageNote.id, (note) => ({
                  ...note,
                  active: false,
                  collapsed: true,
                }));
                setMarginAnchor(undefined);
              }
              closeAssistant();
            }}
            title={
              tab === "chat"
                ? activePassageNote
                  ? `Ask · ${source?.kind === "pptx" ? "Slide" : "Page"} ${activePassageNote.page}`
                  : marginAnchor
                    ? `Ask · ${notebookSources.find((s) => s.id === marginAnchor.sourceId)?.kind === "pptx" ? "Slide" : "Page"} ${marginAnchor.page}`
                    : "Conversation"
                : tab === "notes"
                  ? "Notes"
                  : tab === "studio"
                    ? "Studio"
                    : "Agent"
            }
            aria-label="Notebook assistant"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !modal && !suggestionsOpen) {
                event.stopPropagation();
                closeAssistant();
              }
            }}
          >
            {tab === "agent" ? (
              <AgentPanel
                key={activeId}
                notebookId={activeId}
                sources={notebookSources}
                onCitation={showCitation}
                onSave={saveArtifact}
                onSettings={() => setModal("settings")}
              />
            ) : tab === "studio" ? (
              <StudyStudio
                notebookId={activeId}
                sources={enabledSources}
                artifacts={artifacts}
                onSave={saveArtifact}
                onDelete={deleteArtifact}
                onCitation={showCitation}
              />
            ) : tab === "chat" ? (
              <>
                <div className="chat-scroll">
                  {!panelMessages.length ? (
                    <div className="chat-welcome">
                      <div className="assistant-orbit">
                        <Brand />
                        <span className="orbit-dot" />
                      </div>
                      <span className="eyebrow">NOTEBOOK CONVERSATION</span>
                      <h2>Ask. Explore. Follow up.</h2>
                      <p>
                        Get an explanation, connect ideas, or make a study plan.
                        Your questions and source-linked answers stay together
                        in order.
                      </p>
                      <div className="prompt-cards">
                        <button
                          onClick={() =>
                            chooseSuggestion(
                              "Explain the most important idea in my sources in plain language.",
                            )
                          }
                          disabled={!enabledSources.length}
                        >
                          <span className="prompt-icon violet">
                            <BookOpen size={16} />
                          </span>
                          <span>
                            <strong>Explain a concept</strong>
                            <small>Start with a clear explanation</small>
                          </span>
                          <ArrowRight size={14} />
                        </button>
                        <button
                          onClick={() =>
                            chooseSuggestion(
                              "Summarize the key ideas in my sources.",
                            )
                          }
                          disabled={!enabledSources.length}
                        >
                          <span className="prompt-icon green">
                            <Layers size={16} />
                          </span>
                          <span>
                            <strong>Find the big picture</strong>
                            <small>Bring the main ideas together</small>
                          </span>
                          <ArrowRight size={14} />
                        </button>
                        <button
                          onClick={() =>
                            chooseSuggestion(
                              "Create five study questions with short answers based on my sources.",
                            )
                          }
                          disabled={!enabledSources.length}
                        >
                          <span className="prompt-icon peach">
                            <Sparkles size={16} />
                          </span>
                          <span>
                            <strong>Practice what you learned</strong>
                            <small>Turn the reading into questions</small>
                          </span>
                          <ArrowRight size={14} />
                        </button>
                      </div>
                      <div className="grounded-note">
                        <span className="status-dot" />
                        Answers link back to the selected sources
                      </div>
                    </div>
                  ) : (
                    <div className="messages" aria-live="polite">
                      {panelMessages.map((m) => {
                        const passageNote = notebook?.passageNotes?.find(
                          (note) =>
                            note.messages.some(
                              (message) => message.id === m.id,
                            ),
                        );
                        const passageSource = passageNote
                          ? notebookSources.find(
                              (item) => item.id === passageNote.sourceId,
                            )
                          : undefined;
                        return (
                          <div
                            key={m.id}
                            id={`chat-message-${m.id}`}
                            className={`message ${m.role}`}
                          >
                            {m.role === "assistant" && (
                              <div className="message-author">
                                <Brand small />
                                <strong>NemoDoc</strong>
                              </div>
                            )}
                            {m.content ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[
                                  [
                                    rehypeKatex,
                                    {
                                      trust: false,
                                      maxExpand: 1000,
                                      maxSize: 20,
                                    },
                                  ],
                                ]}
                                components={{
                                  a: ({ href, children }) =>
                                    href?.startsWith("#citation-") ? (
                                      <button
                                        className="inline-citation"
                                        onClick={() => {
                                          const c = m.citations?.find(
                                            (c) =>
                                              c.id === Number(href.slice(10)),
                                          );
                                          if (c) showCitation(c);
                                        }}
                                      >
                                        {children}
                                      </button>
                                    ) : (
                                      <a
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {children}
                                      </a>
                                    ),
                                }}
                              >
                                {citationMarkdown(
                                  m.role === "user"
                                    ? m.content.split(
                                        "\n\nSelected passage from ",
                                      )[0]
                                    : m.content,
                                  m.citations ?? [],
                                )}
                              </ReactMarkdown>
                            ) : m.error ? (
                              <div className="form-error" role="alert">
                                {m.error}
                              </div>
                            ) : m.cancelled ? (
                              <div className="form-error" role="status">
                                Answer cancelled. You can regenerate it.
                              </div>
                            ) : (
                              <div className="thinking">
                                <span />
                                <span />
                                <span />
                                <small>Reading your sources</small>
                              </div>
                            )}
                            {m.role === "user" && passageNote && (
                              <button
                                type="button"
                                className="message-passage-context"
                                title="Show this passage in the document"
                                onClick={() => openPassageNote(passageNote.id)}
                              >
                                <span className="message-passage-source">
                                  <FileText size={13} />
                                  {passageSource?.name.replace(
                                    /\.(pdf|pptx)$/i,
                                    "",
                                  ) ?? "Source"}
                                  <span aria-hidden="true">·</span>
                                  {passageSource?.kind === "pptx"
                                    ? "Slide"
                                    : "Page"}{" "}
                                  {passageNote.page}
                                </span>
                                <span className="message-passage-quote">
                                  {passageNote.quote}
                                </span>
                              </button>
                            )}
                            {m.role === "assistant" &&
                              m.content &&
                              !!m.citations?.length && (
                                <div className="citation-list">
                                  {m.citations
                                    .filter((c) =>
                                      usesCitation(
                                        m.content,
                                        c,
                                        m.citations ?? [],
                                      ),
                                    )
                                    .map((c) => (
                                      <button
                                        key={c.id}
                                        title={c.text}
                                        onClick={() => showCitation(c)}
                                      >
                                        <span>{c.id}</span>
                                        {c.sourceName
                                          .replace(/\.(pdf|pptx)$/i, "")
                                          .slice(0, 23)}
                                        <small>
                                          {notebookSources.find(
                                            (s) => s.id === c.sourceId,
                                          )?.kind === "pptx"
                                            ? "Slide"
                                            : "Page"}{" "}
                                          {c.page}
                                        </small>
                                      </button>
                                    ))}
                                </div>
                              )}
                            {m.role === "assistant" && m.content && (
                              <SupportingPages
                                message={m}
                                sources={notebookSources}
                                open={showCitation}
                              />
                            )}
                            {m.role === "assistant" &&
                              passageNote &&
                              m.content.trim() &&
                              !m.incomplete &&
                              m.id !== streamingMessageId && (
                                <div
                                  className="passage-message-actions"
                                  aria-label="Passage answer actions"
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void navigator.clipboard.writeText(
                                        m.content,
                                      );
                                      notify("Answer copied");
                                    }}
                                  >
                                    <Copy size={14} />
                                    <span>Copy</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      regeneratePassage(passageNote.id, m.id)
                                    }
                                  >
                                    <RefreshCw size={14} />
                                    <span>Regenerate</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="save-answer"
                                    disabled={m.savedToNotes}
                                    onClick={() => saveAnswer(m.id)}
                                  >
                                    <Check size={14} />
                                    <span>
                                      {m.savedToNotes
                                        ? "Saved"
                                        : "Add to Notes"}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      deletePassageNote(passageNote.id)
                                    }
                                  >
                                    <Trash2 size={14} />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            {m.role === "assistant" &&
                              !passageNote &&
                              m.content.trim() &&
                              !m.incomplete &&
                              m.id !== streamingMessageId && (
                                <button
                                  type="button"
                                  className="save-answer"
                                  disabled={m.savedToNotes}
                                  onClick={() => saveAnswer(m.id)}
                                >
                                  <Check size={14} />
                                  {m.savedToNotes ? "Saved" : "Save to Notes"}
                                </button>
                              )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div ref={chatBottom} />
                </div>
              </>
            ) : (
              <div className="notes-scroll">
                <div className="notes-intro">
                  <h2>Your notebook</h2>
                  <div
                    className="notes-view-switch"
                    role="group"
                    aria-label="Notes sections"
                  >
                    <button
                      type="button"
                      aria-pressed={notesView === "answers"}
                      onClick={() => setNotesView("answers")}
                    >
                      Answers <span>{savedAnswers.length}</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={notesView === "highlights"}
                      onClick={() => setNotesView("highlights")}
                    >
                      Highlights <span>{notebookAnnotations.length}</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={notesView === "scratchpad"}
                      onClick={() => setNotesView("scratchpad")}
                    >
                      Notebook
                    </button>
                  </div>
                </div>
                {notesView === "answers" ? (
                  <section className="notes-section" aria-label="Saved answers">
                    <div className="notes-section-heading">
                      <strong>Saved answers</strong>
                      <span>Oldest first</span>
                    </div>
                    {savedAnswers.length ? (
                      <div className="saved-answer-list">
                        {savedAnswers.map(({ answer, question }, index) => (
                          <SavedAnswerCard
                            key={answer.id}
                            number={index + 1}
                            question={question}
                            answer={answer}
                            sources={notebookSources}
                            onCitation={showCitation}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="notes-empty">
                        <MessageSquare size={25} strokeWidth={1.5} />
                        <p>
                          Your saved explanations will appear here in order.
                        </p>
                        <span>
                          Save any completed answer from your conversation.
                        </span>
                        <button
                          type="button"
                          className="notes-open-chat"
                          onClick={openConversation}
                        >
                          Open conversation <ArrowRight size={14} />
                        </button>
                      </div>
                    )}
                  </section>
                ) : notesView === "highlights" ? (
                  <section
                    className="notes-section"
                    aria-label="Highlights and annotations"
                  >
                    <div className="notes-section-heading">
                      <strong>Highlights & annotations</strong>
                      <span>{notebookAnnotations.length} saved</span>
                    </div>
                    <input
                      className="annotation-filter"
                      aria-label="Filter annotations"
                      placeholder="Filter highlights…"
                      value={annotationFilter}
                      onChange={(e) => setAnnotationFilter(e.target.value)}
                    />
                    {filteredAnnotations.map((a, index) => (
                      <div
                        key={a.id}
                        className={`annotation-card ${a.color} ${a.id === selectedAnnotation ? "focused" : ""}`}
                      >
                        <div>
                          <button
                            className="annotation-source"
                            onClick={() => openSource(a.sourceId, a.page)}
                          >
                            <FileText size={12} />
                            {sources
                              .find((s) => s.id === a.sourceId)
                              ?.name.replace(/\.(pdf|pptx)$/i, "")
                              .slice(0, 26)}
                            <span>
                              {sources.find((s) => s.id === a.sourceId)
                                ?.kind === "pptx"
                                ? "slide"
                                : "page"}{" "}
                              {a.page}
                            </span>
                          </button>
                          <span className="annotation-sequence">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <button
                            className="icon-button small"
                            aria-label="Delete annotation"
                            onClick={() => void removeAnnotation(a)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <blockquote>{a.quote}</blockquote>
                        <textarea
                          aria-label="Annotation note"
                          placeholder="Add your thought…"
                          value={a.note}
                          autoFocus={activeAnnotation?.id === a.id}
                          onFocus={() => setSelectedAnnotation(a.id)}
                          onChange={(e) =>
                            editAnnotation({ ...a, note: e.target.value })
                          }
                        />
                        <div className="annotation-colors">
                          <input
                            className="annotation-tags"
                            aria-label="Annotation tags"
                            placeholder="Add tags…"
                            value={(a.tags ?? []).join(", ")}
                            onChange={(e) =>
                              editAnnotation({
                                ...a,
                                tags: e.target.value
                                  .split(",")
                                  .map((t) => t.trimStart()),
                              })
                            }
                          />
                          {(["yellow", "mint", "lavender"] as const).map(
                            (c) => (
                              <button
                                key={c}
                                aria-label={`Change annotation to ${c}`}
                                className={`color-dot ${c} ${a.color === c ? "chosen" : ""}`}
                                onClick={() =>
                                  editAnnotation({ ...a, color: c })
                                }
                              />
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                    {!filteredAnnotations.length && (
                      <div className="notes-empty">
                        <NotebookPen size={25} strokeWidth={1.4} />
                        <p>
                          {annotationFilter
                            ? "No highlights match this filter."
                            : "Highlights from your reading will appear here."}
                        </p>
                        <span>
                          {annotationFilter
                            ? "Try another word or clear the filter."
                            : "Select a passage in the reader and choose Highlight or Note."}
                        </span>
                      </div>
                    )}
                  </section>
                ) : (
                  <section
                    className="notes-section"
                    aria-label="Notebook notes"
                  >
                    <div className="notes-section-heading">
                      <strong>Notebook notes</strong>
                      <span>Auto-saved</span>
                    </div>
                    <div className="notebook-note">
                      <label htmlFor="notebook-note">
                        <NotebookPen size={15} />
                        Ideas, connections, and reminders
                        <span>
                          <Check size={12} /> Saved locally
                        </span>
                      </label>
                      <textarea
                        id="notebook-note"
                        aria-label="Notebook notes"
                        placeholder="A thought to come back to…"
                        value={notebook?.notes ?? ""}
                        onChange={(e) => {
                          if (notebook)
                            updateNotebook({
                              ...notebook,
                              notes: e.target.value,
                            });
                        }}
                      />
                    </div>
                  </section>
                )}
              </div>
            )}
          </AssistantPanel>
        </div>
        <div
          ref={chatDock}
          className="workspace-chat chat-composer-area"
          aria-label="Notebook chat"
        >
          {suggestionsOpen && (
            <section
              id="chat-suggestions"
              className="chat-suggestions"
              aria-label="Suggested questions"
            >
              <header>
                <div>
                  <Sparkles size={16} />
                  <strong>A little inspiration</strong>
                </div>
                <button
                  type="button"
                  className="icon-button small"
                  aria-label="Close suggestions"
                  onClick={() => setSuggestionsOpen(false)}
                >
                  <X size={16} />
                </button>
              </header>
              <div className="prompt-cards">
                <button
                  onClick={() =>
                    chooseSuggestion("Summarize the key ideas in my sources.")
                  }
                  disabled={busy || !enabledSources.length}
                >
                  <span className="prompt-icon violet">
                    <FileText size={17} />
                  </span>
                  <span>
                    <strong>Find the big picture</strong>
                    <small>A summary of the key ideas</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
                <button
                  onClick={() =>
                    chooseSuggestion(
                      "What connections can you find between the ideas in my sources?",
                    )
                  }
                  disabled={busy || !enabledSources.length}
                >
                  <span className="prompt-icon green">
                    <Layers size={17} />
                  </span>
                  <span>
                    <strong>Connect the dots</strong>
                    <small>Discover themes across sources</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
                <button
                  onClick={() =>
                    chooseSuggestion(
                      "Create five thoughtful study questions with short answers based on these sources.",
                    )
                  }
                  disabled={busy || !enabledSources.length}
                >
                  <span className="prompt-icon peach">
                    <MessageSquare size={17} />
                  </span>
                  <span>
                    <strong>Go a little deeper</strong>
                    <small>Questions worth thinking about</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </section>
          )}
          {retrievalInfo && (
            <small className="retrieval-info" role="status">
              {retrievalInfo}
            </small>
          )}
          {visual && (
            <div className="visual-context">
              <img src={visual.image} alt="Selected page for visual question" />
              <span>Page {visual.page} · ask about this image</span>
              <button
                className="icon-button small"
                aria-label="Remove page image"
                onClick={() => setVisual(undefined)}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {chatError && (
            <div className="chat-error" role="alert">
              {chatError}
              <button
                aria-label="Dismiss chat error"
                className="icon-button small"
                onClick={() => setChatError("")}
              >
                <X size={13} />
              </button>
            </div>
          )}
          {context && (
            <div className="quote-context">
              <div>
                <span>Selected passage · p. {context.page}</span>
                <p>{context.quote}</p>
              </div>
              <button
                className="icon-button small"
                aria-label="Clear selected passage"
                onClick={() => setContext(undefined)}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              ref={composer}
              aria-label="Ask about your sources"
              placeholder="Ask about your sources…"
              value={draft}
              maxLength={8000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
            />
            <div className="composer-layout">
              <div className="composer-tools">
                <button
                  type="button"
                  ref={chatLauncher}
                  className="composer-chat-toggle"
                  aria-label={
                    panelOpen && tab === "chat" ? "Close chat" : "Open chat"
                  }
                  title={
                    panelOpen && tab === "chat"
                      ? "Hide conversation"
                      : "Open conversation"
                  }
                  aria-expanded={panelOpen && tab === "chat"}
                  aria-controls="notebook-assistant"
                  onClick={() => {
                    if (panelOpen && tab === "chat") closeAssistant();
                    else openConversation();
                  }}
                >
                  {panelOpen && tab === "chat" ? (
                    <ChevronDown size={14} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={14} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className={`composer-suggestions ${topicNoteNext ? "active" : ""}`}
                  aria-label="Create a topic note from this question"
                  aria-pressed={topicNoteNext}
                  title={
                    topicNoteNext
                      ? "Turn off topic note for the next answer"
                      : "Create a topic note from the next answer"
                  }
                  onClick={() => setTopicNoteNext((value) => !value)}
                >
                  <NotebookPen size={15} />
                  <span className="sr-only">
                    {topicNoteNext ? "Topic note on" : "Create topic note"}
                  </span>
                </button>
                <button
                  type="button"
                  className="composer-suggestions"
                  aria-label="Suggestions"
                  aria-expanded={suggestionsOpen}
                  aria-controls="chat-suggestions"
                  title="Suggested prompts"
                  onClick={() => setSuggestionsOpen(!suggestionsOpen)}
                >
                  <Grid2X2 size={15} />
                  <span className="sr-only">Suggested prompts</span>
                </button>
                <span className="composer-source-count sr-only">
                  <Layers size={13} />
                  {context
                    ? "Selected passage"
                    : `${enabledSources.length} ${enabledSources.length === 1 ? "source" : "sources"}`}
                </span>
              </div>
              <div className="composer-actions">
                <AnswerModeControl
                  value={answerMode}
                  onChange={setAnswerMode}
                />
                {busy ? (
                  <button
                    type="button"
                    className="send-button stop"
                    aria-label="Stop answer"
                    onClick={() => abort.current?.abort()}
                  >
                    <Square size={13} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    className="send-button"
                    aria-label="Send question"
                    disabled={!draft.trim() || !notebookSources.length}
                  >
                    <ArrowUp size={18} />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
        <footer className="workspace-footer">
          <span
            className="model-attribution"
            title={status.configured ? status.model : undefined}
          >
            <span
              className={`status-dot ${status.configured ? "" : "offline"}`}
            />
            {status.configured
              ? `Powered by ${modelName(status.model)}`
              : "Choose a model in Settings"}
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast.message}</span>
          {toast.undo && <button onClick={toast.undo}>Undo</button>}
          <button
            className="icon-button small"
            aria-label="Dismiss notification"
            onClick={() => setToast(undefined)}
          >
            <X size={13} />
          </button>
        </div>
      )}
      {importing && (
        <div className="import-progress" role="status">
          <LoaderCircle className="spin" size={17} />
          <span>{importing}</span>
        </div>
      )}
      {modal === "new" && (
        <Modal title="A new place to think" onClose={() => setModal(null)}>
          <p className="modal-description">
            Bring related sources together in a notebook.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createNotebook();
            }}
          >
            <label className="form-label">
              Notebook title
              <input
                autoFocus
                placeholder="What are you exploring?"
                maxLength={80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <label className="form-label">
              A little context <span>optional</span>
              <input
                placeholder="A few words about this collection"
                maxLength={160}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <button
              className="primary-button modal-submit"
              disabled={!title.trim()}
            >
              <Plus size={16} />
              Create notebook
            </button>
          </form>
        </Modal>
      )}
      {modal === "library" && (
        <Modal title="Your notebooks" onClose={() => setModal(null)}>
          <p className="modal-description">
            A collection of things worth understanding.
          </p>
          <div className="library-grid">
            {notebooks.map((n) => (
              <button
                key={n.id}
                className={`notebook-card ${activeId === n.id ? "active" : ""}`}
                onClick={() => openNotebook(n.id)}
              >
                <span className="notebook-cover">
                  <BookOpen size={28} strokeWidth={1.3} />
                </span>
                <strong>{n.title}</strong>
                <p>{n.description || "Room for your ideas"}</p>
                <span>
                  {sources.filter((s) => s.notebookId === n.id).length} sources
                  <ArrowRight size={14} />
                </span>
              </button>
            ))}
            <button
              className="notebook-card new-card"
              disabled={busy}
              onClick={() => setModal("new")}
            >
              <Plus size={26} />
              <strong>New notebook</strong>
              <p>Start with a little curiosity.</p>
            </button>
          </div>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="Settings" onClose={() => setModal(null)}>
          <AppearanceSettings theme={theme} onChange={setTheme} />
          <ConnectionSettings
            onSaved={() => {
              void apiJSON<AIStatus>("/api/status")
                .then(setStatus)
                .catch(() => {});
            }}
          />
        </Modal>
      )}
      {searchNotebook && (
        <NotebookSearch
          sources={enabledSources}
          onCitation={showCitation}
          onClose={() => setSearchNotebook(false)}
        />
      )}
      {modal === "help" && (
        <Modal title="A few things to know" onClose={() => setModal(null)}>
          <div className="help-list">
            <div>
              <Upload size={20} />
              <p>
                <strong>Bring your sources</strong>Drop a PDF or .pptx anywhere.
                Up to 50 MB and 500 pages per source. Export complex slide decks
                to PDF for the best fidelity.
              </p>
            </div>
            <div>
              <NotebookPen size={20} />
              <p>
                <strong>Read actively</strong>Select text to highlight,
                annotate, or ask AI. Use the area highlight tool for images and
                scanned pages.
              </p>
            </div>
            <div>
              <BookOpen size={20} />
              <p>
                <strong>Find your rhythm</strong>Choose vertical, horizontal, or
                book view. Use ← and → to turn pages. Enter sends a question;
                Shift + Enter adds a line.
              </p>
            </div>
            <div>
              <FolderOpen size={20} />
              <p>
                <strong>Keep what matters</strong>Your library persists in this
                browser. Download originals and export notes before clearing
                site data. Use notebook backups to retain documents, notes,
                conversations, and study materials. Legacy .ppt files need
                conversion to PDF or .pptx.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
