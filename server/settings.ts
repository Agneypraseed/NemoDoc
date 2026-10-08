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
const model = z.string().trim().min(1).max(200);
export const settingsSchema = z.object({
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
      embeddingModel: nebius
        ? "Qwen/Qwen3-Embedding-8B"
        : "nvidia/llama-nemotron-embed-1b-v2",
      visionModel: nebius
        ? "openbmb/MiniCPM-V-4_5"
        : "nvidia/nemotron-nano-12b-v2-vl",
      semantic: false,
      rerank: false,
      rerankUrl: nebius
        ? config.baseUrl.replace(/\/$/, "") + "/rerank"
        : "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking",
      rerankModel: "nvidia/rerank-qa-mistral-4b",
    };
    if (filename && existsSync(filename)) {
      try {
        const parsed = settingsSchema.safeParse(
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
) {
  if ((!settings.apiKey || !credentialAllowed(url, settings)) && !isLocal(url))
    throw new Error(
      "Configure a key for this provider in Settings. Embedding and vision endpoints must use the same provider as chat.",
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
