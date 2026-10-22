import { z } from "zod";

export const researchCapabilities = [
  "planning",
  "research",
  "mathematics",
  "review",
] as const;
export const researchCostTiers = [
  "unspecified",
  "economy",
  "balanced",
  "premium",
] as const;
export const routingPriorities = ["balanced", "cost", "quality"] as const;
export const researchProfileSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
      .refine((id) => id !== "default", "The current connection is read-only."),
    name: z.string().trim().min(1).max(100),
    baseUrl: z.string().trim().min(1).max(2000),
    model: z.string().trim().min(1).max(200),
    capabilities: z
      .array(z.enum(researchCapabilities))
      .min(1)
      .max(4)
      .refine((v) => new Set(v).size === v.length),
    costTier: z.enum(researchCostTiers).default("unspecified"),
    strengths: z.string().trim().max(600).default(""),
  })
  .strict();
export type ResearchProfile = z.infer<typeof researchProfileSchema>;
export type PublicResearchProfile = ResearchProfile & {
  tested: boolean;
  hasApiKey: boolean;
};
export type RoutingPriority = (typeof routingPriorities)[number];
export interface ResearchModelCatalog {
  profiles: PublicResearchProfile[];
  plannerProfileId: string;
  priority: RoutingPriority;
  revision: string;
}
export interface ResearchModelRoute {
  profileId: string;
  name: string;
  baseUrl: string;
  model: string;
  configurationRevision: string;
  selection: "automatic" | "manual" | "default";
  reason: string;
}
