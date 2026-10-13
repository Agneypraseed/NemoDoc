// Notebook chat and study generation use NVIDIA Nemotron. Capability models
// (vision, OCR, embeddings, reranking) are configured independently.
export const isNemotron = (model: string) =>
  /nemotron/i.test(model) && !/(?:embed|rerank)/i.test(model);
export function requireNemotron(model: unknown): asserts model is string {
  if (typeof model !== "string" || !isNemotron(model))
    throw new Error(
      "Choose an available NVIDIA Nemotron chat model in Settings.",
    );
}
