import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import JSZip from "jszip";
import type { Slide, SlideElement, Source } from "../types";

pdfjs.GlobalWorkerOptions.workerSrc = worker;
export { pdfjs };
export const pdfOptions = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
};
export const MAX_FILE_SIZE = 50 * 1024 * 1024;
const xml = (text: string) =>
  new DOMParser().parseFromString(text, "application/xml");
const all = (node: Document | Element, tag: string) =>
  Array.from(node.getElementsByTagNameNS("*", tag));
const first = (node: Document | Element, tag: string) => all(node, tag)[0];

async function parsePptx(
  blob: Blob,
): Promise<{ slides: Slide[]; pages: string[] }> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const presentation = xml(
    (await zip.file("ppt/presentation.xml")?.async("string")) ?? "",
  );
  const size = first(presentation, "sldSz");
  const width = Number(size?.getAttribute("cx")) || 12192000;
  const height = Number(size?.getAttribute("cy")) || 6858000;
  const rels = xml(
    (await zip.file("ppt/_rels/presentation.xml.rels")?.async("string")) ?? "",
  );
  const relationMap = new Map(
    all(rels, "Relationship").map((r) => [
      r.getAttribute("Id"),
      r.getAttribute("Target"),
    ]),
  );
  const names = all(presentation, "sldId")
    .map((n) => {
      const target = relationMap.get(n.getAttribute("r:id")) ?? "";
      return target.startsWith("/")
        ? target.slice(1)
        : "ppt/" + target.replace(/^\.\//, "");
    })
    .filter(Boolean);
  if (!names.length || names.length > 500)
    throw new Error("Import a PowerPoint with 1–500 slides.");
  const slides: Slide[] = [];
  for (const name of names) {
    const entry = zip.file(name);
    if (!entry)
      throw new Error(
        "This PowerPoint file is missing slide data. Try exporting it to PDF.",
      );
    const raw = await entry.async("string");
    if (raw.length > 5000000)
      throw new Error(
        "This slide is too complex. Export the deck to PDF first.",
      );
    const slideXml = xml(raw);
    const filename = name.split("/").pop();
    const slideRels = xml(
      (await zip.file(`ppt/slides/_rels/${filename}.rels`)?.async("string")) ??
        "",
    );
    const elements: SlideElement[] = [];
    for (const shape of [...all(slideXml, "sp"), ...all(slideXml, "pic")]) {
      const transform = first(shape, "xfrm");
      const off = transform && first(transform, "off");
      const ext = transform && first(transform, "ext");
      const fallback = elements.length;
      const rect = {
        x: off ? Number(off.getAttribute("x")) / width : 0.07,
        y: off
          ? Number(off.getAttribute("y")) / height
          : 0.09 + fallback * 0.16,
        width: ext ? Number(ext.getAttribute("cx")) / width : 0.86,
        height: ext ? Number(ext.getAttribute("cy")) / height : 0.14,
      };
      const text = all(shape, "p")
        .map((p) =>
          all(p, "t")
            .map((t) => t.textContent)
            .join(""),
        )
        .join("\n")
        .trim();
      if (text) {
        const props = first(shape, "rPr") ?? first(shape, "defRPr");
        const color = props && first(props, "srgbClr")?.getAttribute("val");
        elements.push({
          kind: "text",
          ...rect,
          text,
          fontSize:
            (Number(props?.getAttribute("sz")) || (fallback ? 2000 : 3200)) /
            100,
          bold: props?.getAttribute("b") === "1",
          color:
            color && /^[a-f0-9]{6}$/i.test(color) ? "#" + color : "#202534",
        });
      }
      const blip = first(shape, "blip");
      if (blip) {
        const rel = all(slideRels, "Relationship").find(
          (r) => r.getAttribute("Id") === blip.getAttribute("r:embed"),
        );
        const target = rel?.getAttribute("Target");
        // Only embedded raster assets are imported; never resolve external relationships.
        if (
          target &&
          !rel?.getAttribute("TargetMode") &&
          /\.(png|jpe?g|gif|webp)$/i.test(target)
        ) {
          const imagePath = target.startsWith("/")
            ? target.slice(1)
            : target.startsWith("../")
              ? "ppt/" + target.slice(3)
              : "ppt/slides/" + target;
          const image = zip.file(imagePath);
          if (image) {
            const data = await image.async("uint8array");
            if (data.length > 10000000)
              throw new Error(
                "An embedded slide image exceeds 10 MB. Export the deck to PDF first.",
              );
            const base64 = await image.async("base64");
            const extension = target.split(".").pop()?.toLowerCase();
            elements.push({
              kind: "image",
              ...rect,
              image: `data:image/${extension === "jpg" ? "jpeg" : extension};base64,${base64}`,
            });
          }
        }
      }
    }
    // Tables are retained as selectable text when they cannot be reconstructed.
    for (const table of all(slideXml, "tbl")) {
      const text = all(table, "tr")
        .map((row) =>
          all(row, "tc")
            .map((cell) =>
              all(cell, "t")
                .map((t) => t.textContent)
                .join(""),
            )
            .join("  |  "),
        )
        .join("\n");
      if (text)
        elements.push({
          kind: "text",
          x: 0.07,
          y: 0.45,
          width: 0.86,
          height: 0.5,
          text,
          fontSize: 16,
        });
    }
    slides.push({ width, height, elements });
  }
  return {
    slides,
    pages: slides.map((s) =>
      s.elements
        .filter((e) => e.kind === "text")
        .map((e) => e.text)
        .join("\n"),
    ),
  };
}

export async function importDocument(
  file: File,
  notebookId: string,
  progress: (message: string) => void,
): Promise<Source> {
  if (file.size > MAX_FILE_SIZE)
    throw new Error("Choose a file smaller than 50 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "pdf" && extension !== "pptx")
    throw new Error(
      "Choose a PDF or PowerPoint (.pptx). Export older .ppt files as PDF first.",
    );
  progress(`Opening ${file.name}…`);
  let pages: string[],
    slides: Slide[] | undefined,
    pageAspects: number[] | undefined;
  if (extension === "pdf") {
    const task = pdfjs.getDocument({
      ...pdfOptions,
      data: await file.arrayBuffer(),
    });
    let doc: pdfjs.PDFDocumentProxy | undefined;
    try {
      doc = await task.promise;
      if (doc.numPages > 500)
        throw new Error("Choose a PDF with 500 pages or fewer.");
      pages = [];
      pageAspects = [];
      for (let i = 1; i <= doc.numPages; i++) {
        progress(`Reading page ${i} of ${doc.numPages}…`);
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        pageAspects.push(viewport.height / viewport.width);
        const content = await page.getTextContent();
        pages.push(
          content.items
            .map((item) =>
              "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
            )
            .join("")
            .trim(),
        );
        page.cleanup();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "PasswordException")
        throw new Error(
          "This PDF is password protected. Upload an unlocked copy.",
        );
      throw error;
    } finally {
      await task.destroy();
    }
  } else {
    ({ pages, slides } = await parsePptx(file));
  }
  return {
    id: crypto.randomUUID(),
    notebookId,
    name: file.name,
    kind: extension,
    blob: file,
    pages,
    slides,
    pageAspects,
    size: file.size,
    createdAt: Date.now(),
  };
}
