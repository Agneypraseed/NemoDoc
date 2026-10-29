import { z } from "zod";
const reference = z.object({
  sourceId: z.string().min(1).max(100),
  page: z.number().int().positive(),
});
export const localQuizAttemptSchema = z.object({
  id: z.string().min(1).max(100),
  notebookId: z.string().min(1).max(100),
  artifactId: z.string().min(1).max(100),
  title: z.string().min(1).max(250),
  completedAt: z.number().int().nonnegative(),
  answers: z
    .array(
      z
        .object({
          question: z.string().min(1).max(4000),
          choices: z.array(z.string().max(2000)).min(2).max(10),
          selected: z.number().int().nonnegative(),
          correct: z.number().int().nonnegative(),
          references: z.array(reference).max(20),
        })
        .refine(
          (a) => a.selected < a.choices.length && a.correct < a.choices.length,
          "Answer choices changed; check this quiz again.",
        ),
    )
    .min(1)
    .max(100),
});
export type LocalQuizAttempt = z.infer<typeof localQuizAttemptSchema>;
export const studyFocusSchema = z
  .array(
    z.object({
      question: z.string().min(1).max(4000),
      selectedAnswer: z.string().max(2000),
      expectedAnswer: z.string().max(2000),
      references: z.array(reference).min(1).max(20),
    }),
  )
  .min(1)
  .max(10);
export type StudyFocus = z.infer<typeof studyFocusSchema>;
