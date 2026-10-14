import { z } from "zod";
export const agentResponseSchema = z.object({
  id: z.string().max(200).optional(),
  usage: z
    .object({
      prompt_tokens: z.number().nonnegative().optional(),
      completion_tokens: z.number().nonnegative().optional(),
    })
    .optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().max(50000).nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string().min(1).max(200),
                type: z.literal("function"),
                function: z.object({
                  name: z.string().max(100),
                  arguments: z.string().max(70000),
                }),
              }),
            )
            .max(6)
            .nullish(),
        }),
      }),
    )
    .min(1),
});
