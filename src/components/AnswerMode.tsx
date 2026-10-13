export type AnswerMode = "quick" | "deep";

export function AnswerModeControl({
  value,
  onChange,
  disabled = false,
}: {
  value: AnswerMode;
  onChange: (value: AnswerMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="answer-mode"
      role="group"
      aria-label="Prompt rewrite and answer detail"
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === "quick"}
        title="Nemotron rewrites your request to be concise, then gives a brief cited answer."
        onClick={() => onChange("quick")}
      >
        Quick
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === "deep"}
        title="Nemotron expands your request for a thorough explanation, then gives a detailed cited answer."
        onClick={() => onChange("deep")}
      >
        Deep
      </button>
    </div>
  );
}
