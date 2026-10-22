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
    apiKey: z.string().trim().max(2048).optional(),
    clearApiKey: z.boolean().optional(),
  })
  .strict();
const storedSchema = z.object({
  apiKey: z.string(),
  tested: z.boolean(),
  revision: z.string(),
});
const searchResult = z.object({
  url: z.string().max(4096),
  title: z.string().max(2000),
  content: z.string().optional(),
  published_date: z.string().nullish(),
});
export type WebCandidate = { url: string; title: string; publishedAt?: string };
export class WebResearch {
  value = { apiKey: "", tested: false, revision: randomUUID() as string };
  constructor(
    private filename?: string,
    private fetcher: typeof fetch = fetch,
    private validateURL = publicWebURL,
  ) {
    if (filename && existsSync(filename))
      this.value = storedSchema.parse(
        JSON.parse(readFileSync(filename, "utf8")),
      );
  }
  public() {
    return {
      hasApiKey: !!this.value.apiKey,
      tested: this.value.tested,
      revision: this.value.revision,
    };
  }
  private flush() {
    if (!this.filename) return;
    mkdirSync(path.dirname(this.filename), { recursive: true });
    writeFileSync(this.filename + ".tmp", JSON.stringify(this.value), {
      mode: 0o600,
    });
    renameSync(this.filename + ".tmp", this.filename);
  }
  save(body: unknown) {
    const input = webConnectionSchema.parse(body);
    this.value = {
      apiKey: input.clearApiKey ? "" : input.apiKey || this.value.apiKey,
      tested: false,
      revision: randomUUID(),
    };
    this.flush();
    return this.public();
  }
  private async request(
    endpoint: "search" | "extract",
    body: unknown,
    signal: AbortSignal,
  ) {
    if (!this.value.apiKey)
      throw new Error("Save a Tavily API key in Connections first.");
    try {
      const response = await this.fetcher(
        `https://api.tavily.com/${endpoint}`,
        {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.value.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
        },
      );
      if (!response.ok) throw new Error();
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error();
      return JSON.parse(text);
    } catch {
      signal.throwIfAborted();
      throw new Error(
        "Tavily request failed. Check the saved key, provider quota and connection.",
      );
    }
  }
  async test() {
    const revision = this.value.revision;
    await this.search("NVIDIA research", AbortSignal.timeout(30000));
    if (revision !== this.value.revision)
      throw new Error("Connection changed during the test. Test again.");
    this.value.tested = true;
    this.flush();
    return this.public();
  }
  async search(query: string, signal: AbortSignal): Promise<WebCandidate[]> {
    const raw = await this.request(
      "search",
      {
        query,
        max_results: 5,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
      },
      signal,
    );
    const results = z
      .object({ results: z.array(searchResult).max(20) })
      .parse(raw).results;
    const candidates: WebCandidate[] = [];
    for (const result of results) {
      try {
        candidates.push({
          url: await this.validateURL(result.url),
          title: result.title,
          ...(result.published_date
            ? { publishedAt: result.published_date }
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
    const raw = await this.request(
      "extract",
      {
        urls: [url],
        extract_depth: "basic",
        format: "text",
        include_images: false,
      },
      signal,
    );
    const result = z
      .object({
        results: z.array(
          z.object({ url: z.string(), raw_content: z.string() }),
        ),
        failed_results: z.array(z.unknown()).optional(),
      })
      .parse(raw)
      .results.find((r) => r.url === url);
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
}
