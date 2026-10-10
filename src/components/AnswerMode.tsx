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
        title="Concise answer"
        onClick={() => onChange("quick")}
      >
        Quick
      </button>
      <button
        type="button"
        aria-pressed={value === "deep"}
        title="Detailed answer"
        onClick={() => onChange("deep")}
      >
        Deep
      </button>
    </div>
  );
}
