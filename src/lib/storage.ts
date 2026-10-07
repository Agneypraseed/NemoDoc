import { openDB } from "idb";
import type { Annotation, Notebook, Source, StudyArtifact } from "../types";

const db = openDB("nemodoc", 2, {
  upgrade(database, oldVersion) {
    if (oldVersion < 1) {
      database.createObjectStore("notebooks", { keyPath: "id" });
      database.createObjectStore("sources", { keyPath: "id" });
      database.createObjectStore("annotations", { keyPath: "id" });
    }
    if (oldVersion < 2)
      database.createObjectStore("artifacts", { keyPath: "id" });
  },
});
export const storage = {
  async read() {
    const database = await db;
    const [notebooks, sources, annotations, artifacts] = await Promise.all([
      database.getAll("notebooks") as Promise<Notebook[]>,
      database.getAll("sources") as Promise<Source[]>,
      database.getAll("annotations") as Promise<Annotation[]>,
      database.getAll("artifacts") as Promise<StudyArtifact[]>,
    ]);
    return { notebooks, sources, annotations, artifacts };
  },
  async notebook(value: Notebook) {
    await (await db).put("notebooks", value);
  },
  async source(value: Source) {
    await (await db).put("sources", value);
  },
  async artifact(value: StudyArtifact) {
    await (await db).put("artifacts", value);
  },
  async removeArtifact(id: string) {
    await (await db).delete("artifacts", id);
  },
  async restore(values: {
    notebooks: Notebook[];
    sources: Source[];
    annotations: Annotation[];
    artifacts: StudyArtifact[];
  }) {
    const database = await db;
    const tx = database.transaction(
      ["notebooks", "sources", "annotations", "artifacts"],
      "readwrite",
    );
    for (const name of [
      "notebooks",
      "sources",
      "annotations",
      "artifacts",
    ] as const) {
      for (const value of values[name]) await tx.objectStore(name).put(value);
    }
    await tx.done;
  },
  async annotation(value: Annotation) {
    await (await db).put("annotations", value);
  },
  async removeAnnotation(id: string) {
    await (await db).delete("annotations", id);
  },
  async replaceAnnotations(previous: Annotation[], next: Annotation[]) {
    const tx = (await db).transaction("annotations", "readwrite");
    for (const a of previous)
      if (!next.some((n) => n.id === a.id)) await tx.store.delete(a.id);
    for (const a of next)
      if (previous.find((n) => n.id === a.id) !== a) await tx.store.put(a);
    await tx.done;
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
