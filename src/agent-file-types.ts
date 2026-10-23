import { z } from "zod";

export const agentFileLimit = 64 * 1024;
export const agentFileName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (name) =>
      !/[\\/:<>|?*"\u0000-\u001f\u007f]/.test(name) &&
      !name.includes("..") &&
      !name.startsWith(".") &&
      !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) &&
      /\.(?:md|txt|csv|json)$/i.test(name),
    "Use a plain .md, .txt, .csv or .json filename without directories.",
  );
export const agentFileInput = z
  .object({
    notebookId: z.string().min(1).max(100),
    name: agentFileName,
    content: z
      .string()
      .min(1)
      .max(agentFileLimit)
      .refine((s) => !s.includes("\0"), "Text files only."),
  })
  .strict();

export interface AgentFile {
  id: string;
  notebookId: string;
  name: string;
  bytes: number;
  createdAt: number;
  origin: "upload" | "agent";
  runId?: string;
  citationIds?: number[];
}
