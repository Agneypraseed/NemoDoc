import type { Slide } from "../types";
export async function slideImage(slide: Slide, format = "image/jpeg") {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1800 / slide.width, 1200 / slide.height);
  canvas.width = Math.round(slide.width * scale);
  canvas.height = Math.round(slide.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const element of slide.elements) {
    const x = element.x * canvas.width,
      y0 = element.y * canvas.height,
      width = element.width * canvas.width,
      height = element.height * canvas.height;
    if (element.kind === "image" && element.image) {
      const image = new Image();
      image.src = element.image;
      await image.decode().catch(() => {});
      if (image.naturalWidth) ctx.drawImage(image, x, y0, width, height);
    } else if (element.text) {
      ctx.fillStyle = element.color || "#25303a";
      const fontSize =
        ((element.fontSize || 24) * canvas.width) /
        ((slide.width / 914400) * 72);
      ctx.font = `${element.bold ? "bold " : ""}${fontSize}px Arial`;
      ctx.textBaseline = "top";
      const lineHeight = fontSize * 1.25;
      let y = y0;
      for (const paragraph of element.text.split("\n")) {
        let line = "";
        for (const word of paragraph.split(/\s+/)) {
          const next = line ? line + " " + word : word;
          if (line && ctx.measureText(next).width > width) {
            ctx.fillText(line, x, y);
            y += lineHeight;
            line = word;
          } else line = next;
        }
        ctx.fillText(line, x, y);
        y += lineHeight;
      }
    }
  }
  return canvas.toDataURL(format, 0.85);
}
