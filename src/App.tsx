import { SupportingPages } from "./components/SupportingPages";
import {
  explicitPage,
  pageOnlyRequest,
  wantsPages,
} from "./lib/supporting-pages";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  FolderOpen,
  Grid2X2,
  Layers,
  Leaf,
  LoaderCircle,
  Menu,
  MessageSquare,
  NotebookPen,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
  Download,
  PanelRightClose,
  PanelRightOpen,
  Bot,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Reader } from "./components/Reader";
import { Modal } from "./components/Modal";
import { createDemo } from "./lib/demo";
import { importDocument } from "./lib/documents";
import { download, storage } from "./lib/storage";
import { streamChat } from "./lib/chat";
import { citationMarkdown, usesCitation } from "./lib/citations";
import { mergeStreamMessages, saveAnswerToNotes } from "./lib/save-answer";
import { createBackup, readBackup } from "./lib/backup";
import { apiJSON } from "./lib/api";
import { ConnectionSettings } from "./components/ConnectionSettings";
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
export default function App() {
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
    }>(),
    [selectedAnnotation, setSelectedAnnotation] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(false),
    [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 700);
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
  const notebookSources = sources.filter((s) => s.notebookId === activeId);
  const source = notebookSources.find((s) => s.id === sourceId);
  const notebookAnnotations = annotations.filter((a) =>
    notebookSources.some((s) => s.id === a.sourceId),
  );
  const activeAnnotation = notebookAnnotations.find(
    (a) => a.id === selectedAnnotation,
  );
  const enabledSources = notebookSources.filter((s) => enabled.has(s.id));
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
    setTab("notes");
    setPanelOpen(true);
  };
  const askSelection = (quote: string, selectedPage: number) => {
    if (!source) return;
    setContext({ quote, page: selectedPage, sourceId: source.id });
    setTab("chat");
    setPanelOpen(true);
    setDraft("Explain this passage");
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
    try {
      await apiJSON("/api/agent/sources/revoke", {
        id: value.id,
        notebookId: value.notebookId,
      });
      await storage.removeSource(value.id);
      setSources((list) => list.filter((s) => s.id !== value.id));
      setAnnotations((list) => list.filter((a) => a.sourceId !== value.id));
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
    const text =
      `# ${notebook.title}\n\n${notebook.description}\n\n${notebook.notes}\n\n## Highlights & annotations\n\n` +
      notebookAnnotations
        .map(
          (a) =>
            `### ${sources.find((s) => s.id === a.sourceId)?.name} · page ${a.page}\n\n> ${a.quote.replace(/\n/g, "\n> ")}\n\n${a.note}\n`,
        )
        .join("\n") +
      "\n## Conversation\n\n" +
      notebook.messages
        .map(
          (m) =>
            `### ${m.role === "user" ? "You" : "NemoDoc"}\n\n${m.content}\n\n` +
            (m.citations ?? [])
              .map((c) => `[${c.id}] ${c.sourceName}, page ${c.page}\n`)
              .join(""),
        )
        .join("\n");
    download(
      new Blob([text], { type: "text/markdown" }),
      `${notebook.title.replace(/[^\p{L}\p{N} -]/gu, "") || "Notebook"} - notes.md`,
    );
    notify("Notes exported");
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
        const updated = { ...current, ...saved };
        void storage.notebook(updated).catch(reportStorageError);
        return updated;
      }),
    );
  };
  const send = async (question = draft, onlySources?: Source[]) => {
    if (!notebook || !question.trim() || streaming.current) return;
    if (!enabledSources.length && !context && !visual && !onlySources?.length) {
      setChatError("Select at least one source in the sidebar first.");
      return;
    }
    const target = notebook.id;
    const fullQuestion =
      context && !onlySources
        ? `${question}\n\nSelected passage from ${sources.find((s) => s.id === context.sourceId)?.name}, page ${context.page}:\n${context.quote}`
        : question;
    const selectedSources =
      onlySources ??
      (context
        ? notebookSources.filter((s) => s.id === context.sourceId)
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
          { image: imageQuestion.image, question },
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
            question: fullQuestion,
            history: originalMessages
              .filter((m) => m.content)
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
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className="sidebar">
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
          <span className="beta-label">BETA</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <button className="nav-item" onClick={() => setModal("library")}>
          <Grid2X2 size={17} />
          All notebooks<span>{notebooks.length}</span>
        </button>
        <button
          className="nav-item current"
          onClick={() => setModal("library")}
        >
          <BookOpen size={17} />
          {notebook?.title ?? "Notebook"}
          <ChevronDown size={14} />
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
        <div className="local-card">
          <span className="local-symbol">
            <ShieldCheck size={18} />
          </span>
          <div>
            <strong>A space of your own</strong>
            <p>
              Documents & notes stay
              <br />
              in this browser.
            </p>
          </div>
          <span className="status-dot" />
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setModal("settings")}>
            <Settings2 size={16} />
            Settings
          </button>
          <button
            aria-label="Help and shortcuts"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={17} />
          </button>
        </div>
        <div className="profile">
          <span className="avatar">Y</span>
          <div>
            <strong>Your workspace</strong>
            <small>Local notebook</small>
          </div>
          <Leaf size={15} />
        </div>
      </aside>
      <main className="workspace">
        <header className="workspace-header">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={19} />
            </button>
            <span>My notebooks</span>
            <ChevronRight size={13} />
            <strong>{notebook?.title ?? "Welcome"}</strong>
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="New notebook"
              title="New notebook"
              disabled={busy}
              onClick={() => setModal("new")}
            >
              <Plus size={18} />
            </button>
            <button
              className="subtle-button backup-action"
              aria-label="Back up notebook"
              onClick={() => void backupNotebook()}
              disabled={!notebook}
            >
              <Download size={14} />
              <span>Backup</span>
            </button>
            <button
              className="subtle-button backup-action"
              aria-label="Restore backup"
              onClick={() => backupInput.current?.click()}
            >
              <Upload size={14} />
              <span>Restore</span>
            </button>
            <span className="saved-indicator">
              <Check size={13} />
              Saved locally
            </span>
            <button
              className="subtle-button"
              onClick={exportNotes}
              disabled={!notebook}
            >
              <Download size={14} />
              <span>Export notes</span>
            </button>
            <button
              className="icon-button"
              aria-label={panelOpen ? "Hide assistant" : "Show assistant"}
              onClick={() => setPanelOpen(!panelOpen)}
            >
              {panelOpen ? (
                <PanelRightClose size={18} />
              ) : (
                <PanelRightOpen size={18} />
              )}
            </button>
          </div>
        </header>
        <div className="notebook-header">
          <div>
            <div className="eyebrow">
              <span />A SPACE FOR YOUR IDEAS
            </div>
            <h1>{notebook?.title ?? "Your first notebook"}</h1>
            <p>
              {notebook?.description ||
                "Read a little deeper. Connect a little more."}
            </p>
          </div>
          <button className="model-chip" onClick={() => setModal("settings")}>
            <span className="nvidia-mark">N</span>
            <div>
              <span>POWERED BY</span>
              <strong>NVIDIA Nemotron</strong>
            </div>
            <ChevronDown size={13} />
          </button>
        </div>
        {saveError && (
          <div className="storage-error" role="alert">
            {saveError}
          </div>
        )}
        <div className={`work-area ${compareId ? "comparing" : ""}`}>
          <div className="reading-workspace">
            <div className="reading-actions">
              <button
                className="subtle-button"
                disabled={!enabledSources.length}
                onClick={() => setSearchNotebook(true)}
              >
                <Search size={14} />
                Search ideas
              </button>
              <button
                className="subtle-button"
                disabled={notebookSources.length < 2}
                onClick={() => {
                  if (compareId) setCompareId("");
                  else {
                    const second = notebookSources.find(
                      (s) => s.id !== sourceId,
                    );
                    if (second) {
                      setCompareId(second.id);
                      setComparePage(second.readingState?.page ?? 1);
                      setPanelOpen(false);
                    }
                  }
                }}
              >
                <Layers size={14} />
                {compareId ? "Close comparison" : "Compare sources"}
              </button>
            </div>
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
                  onAsk={(quote, number) => {
                    setContext({ quote, page: number, sourceId: compareId });
                    setTab("chat");
                    setPanelOpen(true);
                  }}
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
          <aside
            id="notebook-assistant"
            className="assistant-panel"
            aria-label="Notebook assistant"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !modal && !suggestionsOpen) {
                event.stopPropagation();
                closeAssistant();
              }
            }}
          >
            <div className="panel-tabs">
              <div>
                <button
                  className={tab === "chat" ? "active" : ""}
                  onClick={() => setTab("chat")}
                >
                  <Sparkles size={16} />
                  Chat
                </button>
                <button
                  className={tab === "notes" ? "active" : ""}
                  onClick={() => setTab("notes")}
                >
                  <NotebookPen size={16} />
                  Notes
                  {notebookAnnotations.length > 0 && (
                    <span className="count-badge">
                      {notebookAnnotations.length}
                    </span>
                  )}
                </button>
                <button
                  className={tab === "studio" ? "active" : ""}
                  onClick={() => setTab("studio")}
                >
                  <Layers size={15} />
                  Studio
                </button>
                <button
                  className={tab === "agent" ? "active" : ""}
                  onClick={() => setTab("agent")}
                >
                  <Bot size={15} />
                  Agent
                </button>
              </div>
              <button
                className="icon-button small panel-close"
                title="Close assistant"
                aria-label="Close assistant"
                onClick={closeAssistant}
              >
                <X size={17} />
              </button>
            </div>
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
                  {!notebook?.messages.length ? (
                    <div className="chat-welcome">
                      <div className="assistant-orbit">
                        <Brand />
                        <span className="orbit-dot" />
                      </div>
                      <div className="eyebrow">THINK TOGETHER</div>
                      <h2>
                        A fresh perspective,
                        <br />a question away.
                      </h2>
                      <p>
                        Explore your sources, untangle an idea,
                        <br />
                        and see how the pieces connect.
                      </p>
                      <div className="grounded-note">
                        <BookOpen size={14} />
                        <span>Answers grounded in your sources.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="messages" aria-live="polite">
                      {notebook.messages.map((m) => (
                        <div key={m.id} className={`message ${m.role}`}>
                          {m.role === "assistant" && (
                            <div className="message-author">
                              <Brand small />
                              <strong>NemoDoc</strong>
                            </div>
                          )}
                          {m.content ? (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
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
                              {citationMarkdown(m.content, m.citations ?? [])}
                            </ReactMarkdown>
                          ) : (
                            <div className="thinking">
                              <span />
                              <span />
                              <span />
                              <small>Reading your sources</small>
                            </div>
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
                      ))}
                    </div>
                  )}
                  <div ref={chatBottom} />
                </div>
              </>
            ) : (
              <div className="notes-scroll">
                <div className="notes-intro">
                  <span className="eyebrow">MAKE IT YOURS</span>
                  <h2>Thoughts in the margins.</h2>
                  <p>A home for the ideas you want to keep.</p>
                </div>
                <div className="notebook-note">
                  <label htmlFor="notebook-note">
                    <NotebookPen size={15} />
                    Notebook notes
                    <span>
                      <Check size={12} />
                      Auto-saved
                    </span>
                  </label>
                  <textarea
                    id="notebook-note"
                    aria-label="Notebook notes"
                    placeholder="An idea, a connection, a question…"
                    value={notebook?.notes ?? ""}
                    onChange={(e) => {
                      if (notebook)
                        updateNotebook({ ...notebook, notes: e.target.value });
                    }}
                  />
                </div>
                <div className="notes-section-title">
                  HIGHLIGHTS & ANNOTATIONS
                  <span>{notebookAnnotations.length}</span>
                </div>
                <input
                  className="annotation-filter"
                  aria-label="Filter annotations"
                  placeholder="Filter by note, passage, or tag…"
                  value={annotationFilter}
                  onChange={(e) => setAnnotationFilter(e.target.value)}
                />
                {!notebookAnnotations.length ? (
                  <div className="notes-empty">
                    <NotebookPen size={28} strokeWidth={1.2} />
                    <p>
                      Select a passage in your document
                      <br />
                      and choose Highlight or Note.
                    </p>
                    <span>For scanned pages, use the area highlight tool.</span>
                  </div>
                ) : (
                  notebookAnnotations
                    .filter(
                      (a) =>
                        !annotationFilter ||
                        `${a.quote} ${a.note} ${(a.tags ?? []).join(" ")} ${a.kind ?? "highlight"}`
                          .toLowerCase()
                          .includes(annotationFilter.toLowerCase()),
                    )
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((a) => (
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
                            <span>p. {a.page}</span>
                          </button>
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
                            placeholder="tags, separated by commas"
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
                    ))
                )}
              </div>
            )}
          </aside>
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
              rows={2}
            />
            <div>
              <div className="composer-tools">
                <button
                  type="button"
                  className="composer-suggestions"
                  aria-label="Suggestions"
                  aria-expanded={suggestionsOpen}
                  aria-controls="chat-suggestions"
                  onClick={() => setSuggestionsOpen(!suggestionsOpen)}
                >
                  <Grid2X2 size={15} />
                  <span>Suggestions</span>
                </button>
                <span className="composer-source-count">
                  <Layers size={13} />
                  {context
                    ? "Selected passage"
                    : `${enabledSources.length} ${enabledSources.length === 1 ? "source" : "sources"}`}
                </span>
              </div>
              <div className="composer-actions">
                <button
                  type="button"
                  ref={chatLauncher}
                  className="composer-chat-toggle"
                  aria-label={
                    panelOpen && tab === "chat" ? "Close chat" : "Open chat"
                  }
                  aria-expanded={panelOpen && tab === "chat"}
                  aria-controls="notebook-assistant"
                  onClick={() => {
                    if (panelOpen && tab === "chat") closeAssistant();
                    else {
                      setTab("chat");
                      setPanelOpen(true);
                    }
                  }}
                >
                  <MessageSquare size={17} />
                </button>
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
          <div className="chat-footnote">
            <span
              className={`status-dot ${status.configured ? "" : "offline"}`}
            />
            {status.configured ? (
              status.local ? (
                "Local NVIDIA inference"
              ) : (
                "NVIDIA Nemotron · source grounded"
              )
            ) : (
              <button onClick={() => setModal("settings")}>
                Connect NVIDIA to start a conversation <ArrowRight size={11} />
              </button>
            )}
          </div>
        </div>
        <footer className="workspace-footer">
          <span>
            <Leaf size={12} />
            Less noise. More meaning.
          </span>
          <span>
            NemoDoc <span className="footer-separator">/</span> Your local
            thinking space
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
        <Modal title="Your AI connection" onClose={() => setModal(null)}>
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
