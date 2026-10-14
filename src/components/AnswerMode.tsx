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
            ? "A concise rewritten request and brief cited answer"
            : "An expanded request and detailed cited explanation"
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
