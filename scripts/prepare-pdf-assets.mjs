import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const folder of ["cmaps", "standard_fonts", "wasm"]) {
  const destination = path.join(root, "public", "pdfjs", folder);
  mkdirSync(destination, { recursive: true });
  cpSync(path.join(root, "node_modules", "pdfjs-dist", folder), destination, {
    recursive: true,
  });
}
console.log("PDF character maps, fonts, and decoders are ready for local use.");
