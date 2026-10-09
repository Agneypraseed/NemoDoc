import { useEffect, useState } from "react";
import type { Citation, Message, Source } from "../types";
import { supportingPages } from "../lib/supporting-pages";
import { pdfjs, pdfOptions } from "../lib/documents";
import { slideImage } from "../lib/page-image";
import { download } from "../lib/storage";
function Preview({ source, page }: { source: Source; page: number }) {
  const [image, setImage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let loading: ReturnType<typeof pdfjs.getDocument> | undefined;
    let render: import("pdfjs-dist").RenderTask | undefined;
    setImage("");
    setError("");
    void (async () => {
      try {
        let result: string;
        if (source.kind === "pptx") {
          const slide = source.slides?.[page - 1];
          if (!slide) throw new Error("Slide data is unavailable.");
          result = await slideImage(slide);
        } else {
          if (!source.blob?.size)
            throw new Error("Original PDF file is unavailable.");
          const data = await source.blob.arrayBuffer();
          if (cancelled) return;
          loading = pdfjs.getDocument({ data, ...pdfOptions });
          const doc = await loading.promise;
          const pdfPage = await doc.getPage(page);
          if (cancelled) return;
          const base = pdfPage.getViewport({ scale: 1 });
          const viewport = pdfPage.getViewport({
            scale: Math.min(1.5, 900 / base.width),
          });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          render = pdfPage.render({ canvas, viewport });
          await render.promise;
          result = canvas.toDataURL("image/png");
        }
        if (!cancelled) setImage(result);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Preview failed.");
      } finally {
        await loading?.destroy();
      }
    })();
    return () => {
      cancelled = true;
      render?.cancel();
      void loading?.destroy();
    };
  }, [source, page]);
  return error ? (
    <p role="alert">Preview unavailable: {error}</p>
  ) : image ? (
    <img
      src={image}
      alt={`${source.name}, ${source.kind === "pptx" ? "Slide" : "Page"} ${page}`}
    />
  ) : (
    <p role="status">Rendering local preview…</p>
  );
}
export function SupportingPages({
  message,
  sources,
  open,
}: {
  message: Message;
  sources: Source[];
  open: (citation: Citation) => void;
}) {
  const groups = supportingPages(message, sources);
  const [shown, setShown] = useState(message.showPages ? 2 : 0);
  const [error, setError] = useState("");
  if (!groups.length) return null;
  return (
    <div className="supporting-pages">
      {!shown && (
        <button onClick={() => setShown(2)}>Show supporting pages</button>
      )}
      {groups
        .slice(0, shown)
        .map(({ citation: c, source, excerpts, error: invalid }) => (
          <section
            className="supporting-page"
            key={`${c.sourceId}:${c.page}`}
            aria-label={`Supporting page ${c.page}`}
          >
            <strong>
              {source?.name ?? c.sourceName} ·{" "}
              {source?.kind === "pptx" ? "Slide" : "Page"} {c.page}
            </strong>
            {invalid ? (
              <p role="alert">{invalid}</p>
            ) : (
              source && (
                <>
                  <Preview source={source} page={c.page} />
                  {excerpts.length ? (
                    excerpts.map((text) => (
                      <blockquote key={text}>{text}</blockquote>
                    ))
                  ) : (
                    <p>
                      No extractable evidence text. Recognize page text (OCR) in
                      the reader to search this page.
                    </p>
                  )}
                  <button onClick={() => open(c)}>Open in reader</button>
                  <button
                    onClick={async () => {
                      try {
                        setError("");
                        const stem = source.name
                          .replace(/\.(pdf|pptx)$/i, "")
                          .replace(/[^\p{L}\p{N} _-]/gu, "_");
                        if (source.kind === "pdf") {
                          const { singlePagePdf } =
                            await import("../lib/page-export");
                          download(
                            await singlePagePdf(source, c.page),
                            `${stem}-page-${c.page}.pdf`,
                          );
                        } else {
                          const image = await slideImage(
                            source.slides![c.page - 1],
                            "image/png",
                          );
                          const response = await fetch(image);
                          download(
                            await response.blob(),
                            `${stem}-slide-${c.page}.png`,
                          );
                        }
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Download failed.",
                        );
                      }
                    }}
                  >
                    Download{" "}
                    {source.kind === "pptx"
                      ? "slide image (PNG)"
                      : "single page (PDF)"}
                  </button>
                </>
              )
            )}
          </section>
        ))}
      {shown > 0 && shown < groups.length && (
        <button onClick={() => setShown(shown + 2)}>
          Show more supporting pages ({groups.length - shown})
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
