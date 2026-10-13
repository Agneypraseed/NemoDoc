import { z } from "zod";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import type { Config } from "./app.ts";
import type { ConnectionSettings } from "../src/types.ts";
import { credentialAllowed, providerKind } from "./providers.ts";
import { isNemotron, requireNemotron } from "../src/lib/model-policy.ts";

export const endpoint = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    );
  }, "Use HTTPS, or HTTP on a loopback address.");
const model = z.string().trim().max(200);
const storedSettingsSchema = z.object({
  baseUrl: endpoint,
  model,
  embeddingBaseUrl: endpoint,
  embeddingModel: model,
  visionBaseUrl: endpoint,
  visionModel: model,
  semantic: z.boolean(),
  rerank: z.boolean(),
  rerankUrl: endpoint,
  rerankModel: model,
  apiKey: z.string().max(2048).optional(),
  clearApiKey: z.boolean().optional(),
});
export const settingsSchema = storedSettingsSchema.refine(
  (s) =>
    isNemotron(s.model) &&
    (!s.semantic || !!s.embeddingModel) &&
    (!s.rerank || !!s.rerankModel),
  "Use a Nemotron chat model; enabled search and reranking need their own model IDs.",
);
export type RuntimeSettings = Omit<ConnectionSettings, "hasApiKey"> & {
  apiKey: string;
};
export const isLocal = (url: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
export class SettingsStore {
  value: RuntimeSettings;
  constructor(
    config: Config,
    private filename?: string,
  ) {
    const nebius = providerKind(config.baseUrl) === "nebius";
    this.value = {
      ...config,
      embeddingBaseUrl: config.baseUrl,
      visionBaseUrl: config.baseUrl,
      embeddingModel: nebius ? "" : "nvidia/llama-nemotron-embed-1b-v2",
      visionModel: nebius
        ? "openbmb/MiniCPM-V-4_5"
        : "nvidia/nemotron-nano-12b-v2-vl",
      semantic: false,
      rerank: false,
      rerankUrl: nebius
        ? config.baseUrl.replace(/\/$/, "") + "/rerank"
        : "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking",
      rerankModel: "",
    };
    if (filename && existsSync(filename)) {
      try {
        const parsed = storedSettingsSchema.safeParse(
          JSON.parse(readFileSync(filename, "utf8")),
        );
        if (parsed.success)
          this.value = {
            ...this.value,
            ...parsed.data,
            apiKey: parsed.data.apiKey ?? config.apiKey,
          };
      } catch {
        console.warn(
          "Saved connection settings could not be read. Using environment defaults.",
        );
      }
    }
    // Capability models are independent of the Nemotron chat connection.
    // Earlier builds erased non-Nemotron vision IDs. Restore a companion for
    // the built-in hosted providers, while leaving custom/local choices alone.
    if (!this.value.visionModel) {
      const provider = providerKind(this.value.baseUrl);
      if (provider === "nebius")
        this.value.visionModel = "openbmb/MiniCPM-V-4_5";
      if (provider === "nvidia")
        this.value.visionModel = "nvidia/nemotron-nano-12b-v2-vl";
      if (provider === "nebius" || provider === "nvidia")
        this.value.visionBaseUrl = this.value.baseUrl;
    }
    if (!this.value.embeddingModel) this.value.semantic = false;
    if (!this.value.rerankModel) this.value.rerank = false;
  }
  public(): ConnectionSettings {
    const { apiKey, ...settings } = this.value;
    return { ...settings, hasApiKey: !!apiKey };
  }
  save(data: z.infer<typeof settingsSchema>) {
    const { clearApiKey, apiKey, ...rest } = data;
    const next = {
      ...rest,
      apiKey: clearApiKey
        ? ""
        : apiKey?.trim() ||
          (new URL(rest.baseUrl).host === new URL(this.value.baseUrl).host
            ? this.value.apiKey
            : ""),
    };
    if (this.filename) {
      mkdirSync(path.dirname(this.filename), { recursive: true });
      writeFileSync(this.filename + ".tmp", JSON.stringify(next, null, 2), {
        mode: 0o600,
      });
      renameSync(this.filename + ".tmp", this.filename);
    }
    this.value = next;
  }
}
export function headers(
  settings: RuntimeSettings,
  url = settings.baseUrl,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(settings.apiKey && credentialAllowed(url, settings)
      ? { Authorization: `Bearer ${settings.apiKey}` }
      : {}),
  };
}
export async function providerJSON(
  fetcher: typeof fetch,
  url: string,
  body: unknown,
  settings: RuntimeSettings,
  signal = AbortSignal.timeout(120000),
  capability: "chat" | "embedding" | "vision" | "rerank" = "chat",
) {
  if ((!settings.apiKey || !credentialAllowed(url, settings)) && !isLocal(url))
    throw new Error(
      "Configure a key for this provider in Settings. Embedding and vision endpoints must use the same provider as chat.",
    );
  const modelId = (body as { model?: unknown })?.model;
  if (capability === "chat") requireNemotron(modelId);
  else if (typeof modelId !== "string" || !modelId.trim())
    throw new Error(
      capability === "vision"
        ? "Set an image-capable vision model in Settings → OCR & images. The chat model is text-only."
        : "Set an embedding or reranking model in Settings before using semantic search.",
    );
  const response = await fetcher(url, {
    method: "POST",
    headers: headers(settings, url),
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "The endpoint rejected the API key. Check your connection in Settings."
        : response.status === 429
          ? "The model is rate limiting requests. Try again shortly."
          : response.status === 404 &&
              capability === "embedding" &&
              isLocal(url)
            ? "The local embedding model is unavailable. Start Ollama and pull the model shown in Settings → Search & embeddings."
            : capability === "vision"
              ? `The vision endpoint returned ${response.status}. Choose an available image-capable model in Settings → OCR & images.`
              : `The configured model endpoint returned ${response.status}. Check its URL and model ID.`,
    );
  return response.json();
}
export const parseJSON = (content: string) =>
  JSON.parse(
    content
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim(),
  );
