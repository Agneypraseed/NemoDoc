export type AnswerMode = "quick" | "deep";

export function AnswerModeControl({
  value,
  onChange,
}: {
  value: AnswerMode;
  onChange: (value: AnswerMode) => void;
}) {
  return (
    <div className="answer-mode" role="group" aria-label="Answer detail">
      <button
        type="button"
        aria-pressed={value === "quick"}
        title="Short, source-cited answer. Uses your selected model."
        onClick={() => onChange("quick")}
      >
        Quick
      </button>
      <button
        type="button"
        aria-pressed={value === "deep"}
        title="Detailed explanation with source citations. Uses the same model."
        onClick={() => onChange("deep")}
      >
        Deep
      </button>
    </div>
  );
}
