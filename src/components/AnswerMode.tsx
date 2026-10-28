import type { AnswerMode } from "../conversation-prompt-types";
export type { AnswerMode } from "../conversation-prompt-types";

export function AnswerModeControl({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: AnswerMode;
  onChange: (value: AnswerMode) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`answer-mode${compact ? " answer-mode-compact" : ""}`}
      role="group"
      aria-label="Answer detail"
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === "quick"}
        title="Give a brief answer with source citations."
        onClick={() => onChange("quick")}
      >
        Quick
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === "deep"}
        title="Give a detailed explanation with source citations."
        onClick={() => onChange("deep")}
      >
        Deep
      </button>
    </div>
  );
}
