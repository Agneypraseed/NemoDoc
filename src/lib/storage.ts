import { openDB } from "idb";
import type { Annotation, Notebook, Source } from "../types";

const db = openDB("nemodoc", 1, {
  upgrade(database) {
    database.createObjectStore("notebooks", { keyPath: "id" });
    database.createObjectStore("sources", { keyPath: "id" });
    database.createObjectStore("annotations", { keyPath: "id" });
  },
});
export const storage = {
  async read() {
    const database = await db;
    const [notebooks, sources, annotations] = await Promise.all([
      database.getAll("notebooks") as Promise<Notebook[]>,
      database.getAll("sources") as Promise<Source[]>,
      database.getAll("annotations") as Promise<Annotation[]>,
    ]);
    return { notebooks, sources, annotations };
  },
  async notebook(value: Notebook) {
    await (await db).put("notebooks", value);
  },
  async source(value: Source) {
    await (await db).put("sources", value);
  },
  async annotation(value: Annotation) {
    await (await db).put("annotations", value);
  },
  async removeAnnotation(id: string) {
    await (await db).delete("annotations", id);
  },
  async removeSource(id: string) {
    const database = await db;
    const tx = database.transaction(["sources", "annotations"], "readwrite");
    await tx.objectStore("sources").delete(id);
    for (const annotation of await tx.objectStore("annotations").getAll())
      if (annotation.sourceId === id)
        await tx.objectStore("annotations").delete(annotation.id);
    await tx.done;
  },
};
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
