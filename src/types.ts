export type ViewMode = "vertical" | "horizontal" | "book";
export type HighlightColor = "yellow" | "mint" | "lavender";
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Annotation {
  id: string;
  sourceId: string;
  page: number;
  quote: string;
  note: string;
  color: HighlightColor;
  rects: Rect[];
  createdAt: number;
  kind?: "highlight" | "underline" | "pen" | "sticky" | "area";
  points?: { x: number; y: number }[];
  tags?: string[];
}
export interface SlideElement {
  kind: "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  image?: string;
  fontSize?: number;
  bold?: boolean;
  color?: string;
}
export interface Slide {
  width: number;
  height: number;
  elements: SlideElement[];
}
export interface Source {
  id: string;
  notebookId: string;
  name: string;
  kind: "pdf" | "pptx";
  blob: Blob;
  pages: string[];
  slides?: Slide[];
  pageAspects?: number[];
  size: number;
  createdAt: number;
  bookmarks?: number[];
  readingState?: {
    page: number;
    mode: ViewMode;
    zoom: number;
    fraction: number;
  };
  ocr?: Record<number, { text: string; regions: (Rect & { text: string })[] }>;
}
export interface Citation {
  id: number;
  sourceId: string;
  sourceName: string;
  page: number;
  text: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  showPages?: boolean;
  savedToNotes?: boolean;
  savedAt?: number;
  incomplete?: boolean;
  error?: string;
  cancelled?: boolean;
  /** Original wording when the user prompt was rewritten before sending. */
  originalPrompt?: string;
}
export interface PassageNote {
  id: string;
  sourceId: string;
  page: number;
  quote: string;
  rects: Rect[];
  question: string;
  answerMode: "quick" | "deep";
  model: string;
  messages: Message[];
  createdAt: number;
  collapsed?: boolean;
  active?: boolean;
  card?: { x?: number; y?: number; width?: number; height?: number };
  /** Topic notes acquire an anchor only after a cited source/page is validated. */
  topic?: boolean;
}
export interface Notebook {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  notes: string;
  notesUpdatedAt?: number;
  savedResearchRuns?: string[];
  messages: Message[];
  passageNotes?: PassageNote[];
}
export interface AIStatus {
  configured: boolean;
  model: string;
  local: boolean;
}
export interface StudyItem {
  question: string;
  answer: string;
  choices?: string[];
  correct?: number;
  citationIds: number[];
}
export interface StudyArtifact {
  id: string;
  notebookId: string;
  kind: "flashcards" | "quiz" | "guide" | "mindmap";
  title: string;
  content: string;
  items: StudyItem[];
  citations: Citation[];
  createdAt: number;
  nodes?: {
    id: string;
    label: string;
    parentId?: string;
    citationIds: number[];
  }[];
}
export interface ConnectionSettings {
  baseUrl: string;
  model: string;
  embeddingModel: string;
  visionModel: string;
  embeddingBaseUrl: string;
  visionBaseUrl: string;
  semantic: boolean;
  rerank: boolean;
  rerankUrl: string;
  rerankModel: string;
  hasApiKey: boolean;
}
