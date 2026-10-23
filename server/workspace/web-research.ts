import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";
import { z } from "zod";
import {
  webProvider,
  webProviders,
  type WebProvider,
  type PublicWebConnection,
} from "../../src/web-research-types.ts";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
// Only globally routable IPv6 unicast; reject mapped IPv4 and transition ranges.
const ipv6Global = new BlockList();
ipv6Global.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
export function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        ipv6Global.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}
export async function publicWebURL(value: string) {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error("Use a public HTTP(S) page URL.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !isIP(host))
    throw new Error("Local addresses are unavailable to web research.");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Local/private addresses are unavailable to web research.");
  url.hash = "";
  return url.href;
}
export const webConnectionSchema = z
  .object({
    provider: webProvider.optional(),
    apiKey: z.string().trim().max(2048).optional(),
    clearApiKey: z.boolean().optional(),
  })
  .strict();
const storedSchema = z.object({
  provider: webProvider.default("tavily"),
  apiKey: z.string(),
  tested: z.boolean(),
  revision: z.string(),
  connections: z
    .partialRecord(
      webProvider,
      z.object({ apiKey: z.string(), tested: z.boolean() }),
    )
    .optional(),
});
const searchResult = z.object({
  url: z.string().max(4096),
  title: z.string().max(2000),
  published_date: z.string().nullish(),
  publishedDate: z.string().nullish(),
});
export type WebCandidate = { url: string; title: string; publishedAt?: string };
class WebProviderError extends Error {}
export class WebResearch {
  value = {
    provider: "tavily" as WebProvider,
    apiKey: "",
    tested: false,
    revision: randomUUID() as string,
  };
  private connections: Partial<
    Record<WebProvider, { apiKey: string; tested: boolean }>
  > = {};
  constructor(
    private filename?: string,
    private fetcher: typeof fetch = fetch,
    private validateURL = publicWebURL,
  ) {
    if (filename && existsSync(filename)) {
      const { connections, ...value } = storedSchema.parse(
        JSON.parse(readFileSync(filename, "utf8")),
      );
      this.value = value;
      this.connections = connections ?? {};
      this.connections[value.provider] = {
        apiKey: value.apiKey,
        tested: value.tested,
      };
    }
  }
  secrets() {
    return [
      ...new Set([
        this.value.apiKey,
        ...Object.values(this.connections).map((c) => c.apiKey),
      ]),
    ].filter(Boolean);
  }
  public(): PublicWebConnection {
    return {
      provider: this.value.provider,
      hasApiKey: !!this.value.apiKey,
      tested: this.value.tested,
      revision: this.value.revision,
      providers: webProvider.options.map((id) => ({
        id,
        hasApiKey: !!this.connections[id]?.apiKey,
        tested: this.connections[id]?.tested ?? false,
      })),
    };
  }
  private flush() {
    if (!this.filename) return;
    mkdirSync(path.dirname(this.filename), { recursive: true });
    writeFileSync(
      this.filename + ".tmp",
      JSON.stringify({ ...this.value, connections: this.connections }),
      {
        mode: 0o600,
      },
    );
    renameSync(this.filename + ".tmp", this.filename);
  }
  save(body: unknown) {
    const input = webConnectionSchema.parse(body);
    const provider = input.provider ?? this.value.provider;
    if (input.clearApiKey && provider !== this.value.provider) {
      this.connections[provider] = { apiKey: "", tested: false };
      this.flush();
      return this.public();
    }
    const saved =
      provider === this.value.provider
        ? this.value
        : this.connections[provider];
    this.value = {
      provider,
      apiKey: input.clearApiKey ? "" : input.apiKey || saved?.apiKey || "",
      tested: false,
      revision: randomUUID(),
    };
    this.connections[provider] = { apiKey: this.value.apiKey, tested: false };
    this.flush();
    return this.public();
  }
  private async request(
    endpoint: "search" | "extract" | "contents" | "v2/search" | "v2/scrape",
    body: unknown,
    signal: AbortSignal,
  ) {
    const connection = this.value;
    const name = webProviders[connection.provider].name;
    if (!connection.apiKey) throw new Error(`${name} API key is required.`);
    const host = {
      tavily: "api.tavily.com",
      exa: "api.exa.ai",
      firecrawl: "api.firecrawl.dev",
    }[connection.provider];
    try {
      const response = await this.fetcher(`https://${host}/${endpoint}`, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          ...(connection.provider === "exa"
            ? { "x-api-key": connection.apiKey }
            : { Authorization: `Bearer ${connection.apiKey}` }),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
      });
      if (!response.ok) {
        const reason =
          response.status === 401 || response.status === 403
            ? "Check your API key."
            : response.status === 402
              ? "Add credits to your provider account."
              : response.status === 429
                ? "Rate limit reached. Try again shortly."
                : "Try again or check the provider’s status.";
        throw new WebProviderError(`${name}: ${reason}`);
      }
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error();
      if (connection.revision !== this.value.revision)
        throw new WebProviderError("Search connection changed. Try again.");
      return JSON.parse(text);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof WebProviderError) throw error;
      throw new Error(
        `${name} could not be reached. Check your connection and try again.`,
      );
    }
  }
  async test() {
    const revision = this.value.revision;
    this.value.tested = false;
    this.connections[this.value.provider] = {
      apiKey: this.value.apiKey,
      tested: false,
    };
    this.flush();
    const signal = AbortSignal.timeout(60000);
    const results = await this.search("NVIDIA research", signal);
    if (!results.length)
      throw new Error("Search returned no readable public results. Try again.");
    if (revision !== this.value.revision)
      throw new Error("Connection changed during the test. Test again.");
    await this.read(results[0], signal);
    if (revision !== this.value.revision)
      throw new Error("Connection changed during the test. Test again.");
    this.value.tested = true;
    this.connections[this.value.provider] = {
      apiKey: this.value.apiKey,
      tested: true,
    };
    this.flush();
    return this.public();
  }
  async search(query: string, signal: AbortSignal): Promise<WebCandidate[]> {
    const provider = this.value.provider;
    const raw = await this.request(
      provider === "firecrawl" ? "v2/search" : "search",
      provider === "exa"
        ? { query, numResults: 5, type: "auto" }
        : provider === "firecrawl"
          ? { query, limit: 5, sources: ["web"] }
          : {
              query,
              max_results: 5,
              search_depth: "basic",
              include_answer: false,
              include_raw_content: false,
            },
      signal,
    );
    this.checkResponse(raw);
    const parsed = z
      .object({ results: z.array(searchResult).max(20) })
      .safeParse(provider === "firecrawl" ? { results: raw.data?.web } : raw);
    if (!parsed.success)
      throw new Error("Search returned an invalid response. Try again.");
    const results = parsed.data.results;
    const candidates: WebCandidate[] = [];
    for (const result of results) {
      try {
        candidates.push({
          url: await this.validateURL(result.url),
          title: result.title,
          ...(result.published_date || result.publishedDate
            ? { publishedAt: result.published_date || result.publishedDate! }
            : {}),
        });
      } catch {
        /* Unsafe or unresolved result is not a candidate. */
      }
    }
    signal.throwIfAborted();
    return candidates;
  }
  async read(candidate: WebCandidate, signal: AbortSignal) {
    const url = await this.validateURL(candidate.url);
    const provider = this.value.provider;
    const raw = await this.request(
      provider === "exa"
        ? "contents"
        : provider === "firecrawl"
          ? "v2/scrape"
          : "extract",
      provider === "exa"
        ? { urls: [url], text: true }
        : provider === "firecrawl"
          ? { url, formats: ["markdown"], onlyMainContent: true }
          : {
              urls: [url],
              extract_depth: "basic",
              format: "text",
              include_images: false,
            },
      signal,
    );
    this.checkResponse(raw);
    const normalized =
      provider === "firecrawl"
        ? {
            results: [
              {
                url: raw.data?.metadata?.sourceURL ?? url,
                raw_content: raw.data?.markdown,
              },
            ],
          }
        : provider === "exa"
          ? {
              results: Array.isArray(raw.results)
                ? raw.results.map(
                    (r: { url?: string; text?: string } | null) => ({
                      url: r?.url,
                      raw_content: r?.text,
                    }),
                  )
                : [],
            }
          : raw;
    const parsed = z
      .object({
        results: z.array(
          z.object({ url: z.string(), raw_content: z.string() }),
        ),
        failed_results: z.array(z.unknown()).optional(),
      })
      .safeParse(normalized);
    const result = parsed.success
      ? parsed.data.results.find((r) => r.url === url)
      : undefined;
    if (!result?.raw_content.trim())
      throw new Error(
        "This page could not be extracted. It cannot support a citation.",
      );
    return {
      ...candidate,
      url,
      text: result.raw_content.slice(0, 12000),
      retrievedAt: Date.now(),
    };
  }
  private checkResponse(raw: any) {
    if (!raw || raw.success === false)
      throw new Error(
        "The provider could not complete this request. Check your key and account credits.",
      );
  }
}
