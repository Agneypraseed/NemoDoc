import { PDFDocument } from "pdf-lib";
import type { Source } from "../types";
export async function singlePagePdf(source: Source, page: number) {
  if (source.kind !== "pdf" || !source.blob?.size)
    throw new Error("Original PDF file is unavailable.");
  const original = await PDFDocument.load(await source.blob.arrayBuffer());
  if (!Number.isInteger(page) || page < 1 || page > original.getPageCount())
    throw new Error("Invalid PDF page.");
  const output = await PDFDocument.create();
  const [copy] = await output.copyPages(original, [page - 1]);
  output.addPage(copy);
  return new Blob([new Uint8Array(await output.save())], {
    type: "application/pdf",
  });
}
