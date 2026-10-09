import JSZip from "jszip";
import { z } from "zod";
import type { Annotation, Notebook, Source, StudyArtifact } from "../types";

export interface LibraryBackup {
  notebooks: Notebook[];
  sources: Source[];
  annotations: Annotation[];
  artifacts: StudyArtifact[];
}
const coordinate = z.number().min(0).max(1);
const rect = z.object({
  x: coordinate,
  y: coordinate,
  width: coordinate,
  height: coordinate,
});
const citation = z.object({
  id: z.number().int().positive(),
  sourceId: z.string(),
  sourceName: z.string(),
  page: z.number().int().positive(),
  text: z.string(),
});
const manifest = z.object({
  version: z.literal(1),
  notebooks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(1000),
        description: z.string(),
        createdAt: z.number(),
        notes: z.string(),
        messages: z.array(
          z.object({
            id: z.string(),
            role: z.enum(["user", "assistant"]),
            content: z.string(),
            citations: z.array(citation).optional(),
            showPages: z.boolean().optional(),
            savedToNotes: z.boolean().optional(),
            incomplete: z.boolean().optional(),
          }),
        ),
      }),
    )
    .max(1000),
  sources: z
    .array(
      z.object({
        id: z.string(),
        notebookId: z.string(),
        name: z.string(),
        kind: z.enum(["pdf", "pptx"]),
        pages: z.array(z.string()).max(500),
        size: z.number(),
        createdAt: z.number(),
        path: z.string().regex(/^sources\/\d+\.(pdf|pptx)$/),
        bookmarks: z.array(z.number().int().positive()).optional(),
        readingState: z
          .object({
            page: z.number().int().positive(),
            mode: z.enum(["vertical", "horizontal", "book"]),
            zoom: z.number().min(50).max(200),
            fraction: coordinate,
          })
          .optional(),
        ocr: z
          .record(
            z.string(),
            z.object({
              text: z.string(),
              regions: z.array(rect.extend({ text: z.string() })),
            }),
          )
          .optional(),
        slides: z
          .array(
            z.object({
              width: z.number().positive(),
              height: z.number().positive(),
              elements: z.array(
                z.object({
                  kind: z.enum(["text", "image"]),
                  x: z.number(),
                  y: z.number(),
                  width: z.number(),
                  height: z.number(),
                  text: z.string().optional(),
                  image: z
                    .string()
                    .regex(
                      /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/,
                    )
                    .optional(),
                  fontSize: z.number().optional(),
                  bold: z.boolean().optional(),
                  color: z.string().optional(),
                }),
              ),
            }),
          )
          .optional(),
        pageAspects: z
          .array(z.number().positive().max(100))
          .max(500)
          .optional(),
      }),
    )
    .max(1000),
  annotations: z.array(
    z.object({
      id: z.string(),
      sourceId: z.string(),
      page: z.number().int().positive(),
      quote: z.string(),
      note: z.string(),
      color: z.enum(["yellow", "mint", "lavender"]),
      rects: z.array(rect),
      createdAt: z.number(),
      kind: z
        .enum(["highlight", "underline", "pen", "sticky", "area"])
        .optional(),
      points: z.array(z.object({ x: coordinate, y: coordinate })).optional(),
      tags: z.array(z.string()).optional(),
    }),
  ),
  artifacts: z
    .array(
      z.object({
        id: z.string(),
        notebookId: z.string(),
        kind: z.enum(["flashcards", "quiz", "guide", "mindmap"]),
        title: z.string(),
        content: z.string(),
        createdAt: z.number(),
        citations: z.array(citation),
        items: z.array(
          z.object({
            question: z.string(),
            answer: z.string(),
            choices: z.array(z.string()).optional(),
            correct: z.number().int().nonnegative().optional(),
            citationIds: z.array(z.number()),
          }),
        ),
        nodes: z
          .array(
            z.object({
              id: z.string(),
              label: z.string(),
              parentId: z.string().optional(),
              citationIds: z.array(z.number()),
            }),
          )
          .optional(),
      }),
    )
    .default([]),
});

export async function createBackup(library: LibraryBackup): Promise<Blob> {
  const zip = new JSZip();
  const sources = await Promise.all(
    library.sources.map(async (source, i) => {
      const { blob, ...meta } = source;
      const path = `sources/${i}.${source.kind}`;
      zip.file(path, await blob.arrayBuffer());
      return { ...meta, path };
    }),
  );
  zip.file(
    "notebook.json",
    JSON.stringify({ version: 1, ...library, sources }, null, 2),
  );
  return new Blob(
    [
      new Uint8Array(
        await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
      ),
    ],
    { type: "application/zip" },
  );
}

export async function readBackup(file: Blob): Promise<LibraryBackup> {
  if (file.size > 250 * 1024 * 1024)
    throw new Error("Choose a backup smaller than 250 MB.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file("notebook.json");
  if (!entry) throw new Error("This is not a NemoDoc backup.");
  const raw = await entry.async("string");
  if (raw.length > 50000000)
    throw new Error("The backup manifest is too large.");
  const parsed = manifest.safeParse(JSON.parse(raw));
  if (!parsed.success)
    throw new Error("This backup has invalid or unsupported notebook data.");
  const data = parsed.data;
  const notebookIds = new Map(
    data.notebooks.map((n) => [n.id, crypto.randomUUID()]),
  );
  const sourceIds = new Map(
    data.sources.map((s) => [s.id, crypto.randomUUID()]),
  );
  if (
    notebookIds.size !== data.notebooks.length ||
    sourceIds.size !== data.sources.length
  )
    throw new Error("This backup contains duplicate IDs.");
  const remapCitation = (
    c: (typeof data.artifacts)[number]["citations"][number],
  ) => ({ ...c, sourceId: sourceIds.get(c.sourceId) ?? c.sourceId });
  let total = 0;
  const sources: Source[] = [];
  for (const source of data.sources) {
    if (!notebookIds.has(source.notebookId))
      throw new Error("A source has no notebook in this backup.");
    const fileEntry = zip.file(source.path);
    if (!fileEntry)
      throw new Error(`The original file for ${source.name} is missing.`);
    const bytes = await fileEntry.async("uint8array");
    total += bytes.length;
    if (bytes.length > 50 * 1024 * 1024 || total > 500 * 1024 * 1024)
      throw new Error("The expanded backup exceeds the library restore limit.");
    const { path, ...meta } = source;
    sources.push({
      ...meta,
      id: sourceIds.get(source.id)!,
      notebookId: notebookIds.get(source.notebookId)!,
      blob: new Blob([new Uint8Array(bytes)], {
        type:
          source.kind === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    });
  }
  for (const a of data.annotations)
    if (
      !sourceIds.has(a.sourceId) ||
      a.page > data.sources.find((s) => s.id === a.sourceId)!.pages.length
    )
      throw new Error("An annotation refers to a missing page.");
  for (const a of data.artifacts)
    if (!notebookIds.has(a.notebookId))
      throw new Error("A study artifact has no notebook.");
  return {
    notebooks: data.notebooks.map((n) => ({
      ...n,
      id: notebookIds.get(n.id)!,
      title: n.title + " (restored)",
      messages: n.messages.map((m) => ({
        ...m,
        id: crypto.randomUUID(),
        citations: m.citations?.map(remapCitation),
      })),
    })),
    sources,
    annotations: data.annotations.map((a) => ({
      ...a,
      id: crypto.randomUUID(),
      sourceId: sourceIds.get(a.sourceId)!,
    })),
    artifacts: data.artifacts.map((a) => ({
      ...a,
      id: crypto.randomUUID(),
      notebookId: notebookIds.get(a.notebookId)!,
      citations: a.citations.map(remapCitation),
    })),
  };
}
