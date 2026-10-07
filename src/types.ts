export type ViewMode = 'vertical' | 'horizontal' | 'book';
export type HighlightColor = 'yellow' | 'mint' | 'lavender';
export interface Rect { x: number; y: number; width: number; height: number }
export interface Annotation {
  id: string; sourceId: string; page: number; quote: string; note: string;
  color: HighlightColor; rects: Rect[]; createdAt: number;
}
export interface SlideElement {
  kind: 'text' | 'image'; x: number; y: number; width: number; height: number;
  text?: string; image?: string; fontSize?: number; bold?: boolean; color?: string;
}
export interface Slide { width: number; height: number; elements: SlideElement[] }
export interface Source {
  id: string; notebookId: string; name: string; kind: 'pdf' | 'pptx';
  blob: Blob; pages: string[]; slides?: Slide[]; size: number; createdAt: number;
}
export interface Citation { id: number; sourceId: string; sourceName: string; page: number; text: string }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; citations?: Citation[] }
export interface Notebook {
  id: string; title: string; description: string; createdAt: number; notes: string; messages: Message[];
}
export interface AIStatus { configured: boolean; model: string; local: boolean }
