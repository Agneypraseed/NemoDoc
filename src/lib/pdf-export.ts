import { PDFDocument, PDFName, PDFArray, PDFHexString, rgb } from "pdf-lib";
import type { Annotation, Source } from "../types";

export async function exportAnnotatedPdf(
  source: Source,
  annotations: Annotation[],
): Promise<Blob> {
  if (source.kind !== "pdf")
    throw new Error(
      "Annotated PDF export requires a PDF source. Export your slide deck to PDF first.",
    );
  const doc = await PDFDocument.load(await source.blob.arrayBuffer());
  const colors = {
    yellow: rgb(0.94, 0.81, 0.35),
    mint: rgb(0.35, 0.73, 0.55),
    lavender: rgb(0.61, 0.43, 0.85),
  };
  for (const annotation of annotations.filter(
    (a) => a.sourceId === source.id,
  )) {
    const page = doc.getPage(annotation.page - 1),
      box = page.getCropBox();
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const point = (x: number, y: number) => {
      const p =
        rotation === 90
          ? { x: y, y: x }
          : rotation === 180
            ? { x: 1 - x, y }
            : rotation === 270
              ? { x: 1 - y, y: 1 - x }
              : { x, y: 1 - y };
      return { x: box.x + p.x * box.width, y: box.y + p.y * box.height };
    };
    const color = colors[annotation.color];
    if (annotation.kind === "pen") {
      const points = annotation.points ?? [];
      for (let i = 1; i < points.length; i++)
        page.drawLine({
          start: point(points[i - 1].x, points[i - 1].y),
          end: point(points[i].x, points[i].y),
          thickness: 2,
          color,
        });
    } else
      for (const r of annotation.rects) {
        if (annotation.kind === "underline")
          page.drawLine({
            start: point(r.x, r.y + r.height),
            end: point(r.x + r.width, r.y + r.height),
            thickness: 1.5,
            color,
          });
        else {
          const a = point(r.x, r.y),
            b = point(r.x + r.width, r.y + r.height);
          page.drawRectangle({
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(b.x - a.x),
            height: Math.abs(b.y - a.y),
            color,
            opacity: annotation.kind === "sticky" ? 0.9 : 0.3,
          });
        }
      }
    const r = annotation.rects[0] ?? {
      x: 0.05,
      y: 0.05,
      width: 0.025,
      height: 0.025,
    };
    const origin = point(r.x, r.y);
    const note = doc.context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: [origin.x, origin.y, origin.x + 18, origin.y + 18],
      Contents: PDFHexString.fromText(
        [
          annotation.quote,
          annotation.note,
          annotation.tags?.length ? `Tags: ${annotation.tags.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      ),
      T: PDFHexString.fromText("NemoDoc"),
      Name: "Comment",
      C: [color.red, color.green, color.blue],
      F: 4,
    });
    const existing =
      page.node.lookupMaybe(PDFName.of("Annots"), PDFArray) ??
      doc.context.obj([]);
    existing.push(doc.context.register(note));
    page.node.set(PDFName.of("Annots"), existing);
  }
  return new Blob([new Uint8Array(await doc.save())], {
    type: "application/pdf",
  });
}
