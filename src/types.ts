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
}
export interface Notebook {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  notes: string;
  messages: Message[];
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
