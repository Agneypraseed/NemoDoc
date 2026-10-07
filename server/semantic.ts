import { createHash } from "node:crypto";
import { retrieve, type Excerpt, type InputSource } from "./retrieval.ts";
import { providerJSON, type RuntimeSettings } from "./settings.ts";

export function chunks(sources: InputSource[]): Excerpt[] {
  const result: Excerpt[] = [];
  for (const source of sources)
    source.pages.forEach((page, index) => {
      for (let start = 0; start < page.length; start += 1200) {
        const text = page.slice(start, start + 1500).trim();
        if (text)
          result.push({
            id: result.length + 1,
            sourceId: source.id,
            sourceName: source.name,
            page: index + 1,
            text,
          });
      }
    });
  return result;
}
export function cosine(a: number[], b: number[]) {
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return dot / (Math.sqrt(aa * bb) || 1);
}
export class SemanticRetriever {
  private vectors = new Map<string, number[]>();
  constructor(private fetcher: typeof fetch) {}
  private hash(text: string, settings: RuntimeSettings) {
    return createHash("sha256")
      .update(
        settings.embeddingBaseUrl +
          settings.embeddingModel +
          settings.apiKey +
          text,
      )
      .digest("hex");
  }
  async search(
    sources: InputSource[],
    question: string,
    settings: RuntimeSettings,
    signal?: AbortSignal,
  ) {
    if (!settings.semantic)
      return { citations: retrieve(sources, question), mode: "keyword" };
    const passages = chunks(sources);
    if (!passages.length) return { citations: [], mode: "semantic" };
    const missing = passages.filter(
      (p) => !this.vectors.has(this.hash(p.text, settings)),
    );
    for (let start = 0; start < missing.length; start += 32) {
      const batch = missing.slice(start, start + 32);
      const data = await providerJSON(
        this.fetcher,
        settings.embeddingBaseUrl.replace(/\/$/, "") + "/embeddings",
        {
          model: settings.embeddingModel,
          input: batch.map((p) => p.text),
          input_type: "passage",
          encoding_format: "float",
          truncate: "END",
        },
        settings,
        signal,
      );
      if (!Array.isArray(data.data) || data.data.length !== batch.length)
        throw new Error("The embedding endpoint returned an incomplete index.");
      if (
        new Set(data.data.map((entry: any) => entry.index)).size !==
        batch.length
      )
        throw new Error(
          "The embedding endpoint returned duplicate vector indexes.",
        );
      for (const entry of data.data) {
        if (
          !Number.isInteger(entry.index) ||
          !batch[entry.index] ||
          !Array.isArray(entry.embedding) ||
          !entry.embedding.length ||
          !entry.embedding.every(
            (n: unknown) => typeof n === "number" && Number.isFinite(n),
          )
        )
          throw new Error("The embedding endpoint returned invalid vectors.");
        this.vectors.set(
          this.hash(batch[entry.index].text, settings),
          entry.embedding,
        );
      }
    }
    const query = await providerJSON(
      this.fetcher,
      settings.embeddingBaseUrl.replace(/\/$/, "") + "/embeddings",
      {
        model: settings.embeddingModel,
        input: [question],
        input_type: "query",
        encoding_format: "float",
        truncate: "END",
      },
      settings,
      signal,
    );
    const vector = query.data?.[0]?.embedding;
    if (
      !Array.isArray(vector) ||
      !vector.length ||
      !vector.every((n: unknown) => typeof n === "number" && Number.isFinite(n))
    )
      throw new Error("The query embedding is invalid.");
    let selected = passages
      .map((p) => {
        const embedded = this.vectors.get(this.hash(p.text, settings))!;
        if (embedded.length !== vector.length)
          throw new Error("The embedding dimensions do not match.");
        return { ...p, score: cosine(vector, embedded) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    if (settings.rerank) {
      const data = await providerJSON(
        this.fetcher,
        settings.rerankUrl,
        {
          model: settings.rerankModel,
          query: { text: question },
          passages: selected.map((p) => ({ text: p.text })),
          truncate: "END",
        },
        settings,
        signal,
      );
      const rankings = data.rankings ?? data.results;
      if (
        !Array.isArray(rankings) ||
        !rankings.length ||
        new Set(rankings.map((r) => r.index)).size !== rankings.length ||
        rankings.some(
          (r) =>
            !Number.isInteger(r.index) ||
            !selected[r.index] ||
            !Number.isFinite(r.logit ?? r.relevance_score),
        )
      )
        throw new Error("The reranker returned an invalid result.");
      selected = rankings
        .filter((r) => Number.isInteger(r.index) && selected[r.index])
        .map((r) => ({
          ...selected[r.index],
          score: r.logit ?? r.relevance_score ?? 0,
        }));
    }
    // Include a representative spread for overview questions, not just the closest passage.
    const overview = /summari[sz]e|overview|key ideas|study guide/i.test(
      question,
    );
    const result = overview
      ? [...selected.slice(0, 5), ...retrieve(sources, "overview", 5)]
      : selected.slice(0, 10);
    const unique = result.filter(
      (p, i) =>
        result.findIndex(
          (q) =>
            q.sourceId === p.sourceId && q.page === p.page && q.text === p.text,
        ) === i,
    );
    if (this.vectors.size > 12000) this.vectors.clear();
    return {
      citations: unique.map((p, i) => ({
        id: i + 1,
        sourceId: p.sourceId,
        sourceName: p.sourceName,
        page: p.page,
        text: p.text,
      })),
      mode: settings.rerank ? "semantic + rerank" : "semantic",
    };
  }
}
