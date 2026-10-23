import { z } from "zod";

export const webProvider = z.enum(["tavily", "exa", "firecrawl"]);
export type WebProvider = z.infer<typeof webProvider>;
export const webProviders = {
  tavily: { name: "Tavily", keyURL: "https://app.tavily.com/" },
  exa: { name: "Exa", keyURL: "https://dashboard.exa.ai/api-keys" },
  firecrawl: {
    name: "Firecrawl",
    keyURL: "https://www.firecrawl.dev/app/api-keys",
  },
} as const;
export interface PublicWebConnection {
  provider: WebProvider;
  hasApiKey: boolean;
  tested: boolean;
  revision: string;
  providers: { id: WebProvider; hasApiKey: boolean; tested: boolean }[];
}
