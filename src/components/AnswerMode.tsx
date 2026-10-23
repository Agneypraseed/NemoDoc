import { ChevronDown, Zap, BookOpen } from "lucide-react";

export type AnswerMode = "quick" | "deep";

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
  if (compact) {
    const Icon = value === "quick" ? Zap : BookOpen;
    return (
      <label
        className="answer-mode-picker"
        title={
          value === "quick"
            ? "A brief answer with source citations"
            : "A detailed explanation with source citations"
        }
      >
        <Icon size={15} aria-hidden="true" />
        <select
          aria-label="Answer detail"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as AnswerMode)}
        >
          <option value="quick">Quick</option>
          <option value="deep">Deep</option>
        </select>
        <ChevronDown size={12} aria-hidden="true" />
      </label>
    );
  }
  return (
    <div className="answer-mode" role="group" aria-label="Answer detail">
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
