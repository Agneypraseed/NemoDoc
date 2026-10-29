import { learningProgress } from "../lib/learning-progress";
import type { LocalQuizAttempt, StudyFocus } from "../study-progress-types";
import type { Citation, Source } from "../types";
import "./learning-progress.css";
export function LearningProgress({
  notebookId,
  attempts,
  sources,
  busy,
  onReview,
  onCitation,
  onClear,
}: {
  notebookId: string;
  attempts: LocalQuizAttempt[];
  sources: Source[];
  busy: boolean;
  onReview: (kind: "guide" | "quiz", focus: StudyFocus) => void;
  onCitation: (citation: Citation) => void;
  onClear: () => void;
}) {
  const progress = learningProgress(notebookId, attempts, sources);
  return (
    <section className="learning-progress" aria-label="Your learning">
      <h3>Your learning</h3>
      {!progress.history.length ? (
        <p>
          Check a quiz to save your progress here and build a review around the
          questions you missed.
        </p>
      ) : (
        <>
          <p>
            {progress.history.length} recorded{" "}
            {progress.history.length === 1 ? "quiz" : "quizzes"} · Last score:{" "}
            {progress.lastScore!.correct}/{progress.lastScore!.total}
          </p>
          <p>
            {progress.missed.length
              ? `${progress.missed.length} questions to revisit based on your latest recorded answers.`
              : "No missed questions in your latest recorded answers. Try another quiz to explore more topics."}
          </p>
          {!!progress.missed.length && (
            <details>
              <summary>Review missed questions</summary>
              {progress.missed.map((item, i) => (
                <article key={i}>
                  <strong>{item.question}</strong>
                  <p>
                    Your choice: {item.choices[item.selected]}
                    <br />
                    Quiz answer: {item.choices[item.correct]}
                  </p>
                  <div>
                    {item.references.map((ref, j) => {
                      const source = sources.find(
                        (s) =>
                          s.id === ref.sourceId && s.notebookId === notebookId,
                      );
                      return source?.pages[ref.page - 1]?.trim() ? (
                        <button
                          key={j}
                          type="button"
                          className="text-button"
                          onClick={() =>
                            onCitation({
                              id: 1,
                              sourceId: source.id,
                              sourceName: source.name,
                              page: ref.page,
                              text: source.pages[ref.page - 1],
                            })
                          }
                        >
                          {source.name} · Page {ref.page}
                        </button>
                      ) : (
                        <span key={j}>Source unavailable or not selected</span>
                      );
                    })}
                  </div>
                </article>
              ))}
            </details>
          )}
          {!!progress.missed.length && (
            <>
              <div className="learning-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || !progress.focus.length}
                  onClick={() => onReview("guide", progress.focus)}
                >
                  Create targeted guide
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || !progress.focus.length}
                  onClick={() => onReview("quiz", progress.focus)}
                >
                  Practice missed topics
                </button>
              </div>
              <p>
                Targeted review sends up to 10 missed-question snapshots and
                selected source passages to your model. Select their sources to
                enable review.
              </p>
            </>
          )}
          <details>
            <summary>Quiz history</summary>
            <ol>
              {progress.history.map((a) => (
                <li key={a.id}>
                  {a.title} ·{" "}
                  {a.answers.filter((x) => x.selected === x.correct).length}/
                  {a.answers.length} ·{" "}
                  {new Date(a.completedAt).toLocaleDateString()}
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (
                  window.confirm(
                    "Clear local quiz history for this notebook? Previously shared agent memory is managed separately.",
                  )
                )
                  onClear();
              }}
            >
              Clear local history
            </button>
          </details>
        </>
      )}
      <small>
        Quiz results save in this browser and are included in notebook backups.
        Sharing with the agent is optional.
      </small>
    </section>
  );
}
