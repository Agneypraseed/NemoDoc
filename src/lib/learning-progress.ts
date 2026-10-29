import type { LocalQuizAttempt, StudyFocus } from "../study-progress-types";
import type { Source } from "../types";
export function learningProgress(
  notebookId: string,
  attempts: LocalQuizAttempt[],
  sources: Source[],
) {
  const history = attempts
    .filter((a) => a.notebookId === notebookId)
    .slice()
    .sort((a, b) => b.completedAt - a.completedAt);
  const latest = new Map<string, LocalQuizAttempt["answers"][number]>();
  for (const attempt of history)
    for (const answer of attempt.answers) {
      const key = JSON.stringify([
        answer.question.trim().toLowerCase(),
        [
          ...new Set(answer.references.map((r) => `${r.sourceId}:${r.page}`)),
        ].sort(),
      ]);
      if (!latest.has(key)) latest.set(key, answer);
    }
  const missed = [...latest.values()].filter((a) => a.selected !== a.correct);
  const focus: StudyFocus = missed
    .flatMap((a) => {
      const references = a.references.filter((r) =>
        sources.some(
          (s) =>
            s.notebookId === notebookId &&
            s.id === r.sourceId &&
            Number.isInteger(r.page) &&
            r.page > 0 &&
            !!s.pages[r.page - 1]?.trim(),
        ),
      );
      return references.length
        ? [
            {
              question: a.question,
              selectedAnswer: a.choices[a.selected],
              expectedAnswer: a.choices[a.correct],
              references,
            },
          ]
        : [];
    })
    .slice(0, 10);
  return {
    history,
    missed,
    focus,
    lastScore: history[0]
      ? {
          correct: history[0].answers.filter((a) => a.selected === a.correct)
            .length,
          total: history[0].answers.length,
        }
      : undefined,
  };
}
