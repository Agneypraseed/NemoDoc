import { useState } from "react";
import {
  DEFAULT_RESEARCH_PROMPTS,
  RESEARCH_EVIDENCE_RULES,
  PLANNER_REQUIRED_RULES,
  type ResearchPrompts,
} from "../research-prompt-types";

export function ResearchPromptEditor({
  value,
  onChange,
}: {
  value: ResearchPrompts;
  onChange: (value: ResearchPrompts) => void;
}) {
  const [role, setRole] = useState<keyof ResearchPrompts>("planner");
  const labels = {
    planner: "Planner",
    researcher: "Researcher",
    reviewer: "Reviewer",
  };
  return (
    <section
      className="research-prompt-editor"
      aria-label="Research instructions"
    >
      <h3>Instructions</h3>
      <p className="agent-fine">
        Set how each role works and formats its answer. You can customize
        individual agents in the team plan.
      </p>
      <div
        className="research-prompt-tabs"
        role="group"
        aria-label="Instruction role"
      >
        {(Object.keys(labels) as (keyof ResearchPrompts)[]).map((key) => (
          <button
            type="button"
            key={key}
            aria-pressed={role === key}
            onClick={() => setRole(key)}
          >
            {labels[key]}
          </button>
        ))}
      </div>
      <label className="field-label">
        {labels[role]} instructions
        <textarea
          aria-label={`${labels[role]} instructions`}
          rows={7}
          maxLength={12000}
          value={value[role]}
          onChange={(e) => onChange({ ...value, [role]: e.target.value })}
        />
      </label>
      <button
        type="button"
        className="text-button"
        disabled={value[role] === DEFAULT_RESEARCH_PROMPTS[role]}
        onClick={() =>
          onChange({ ...value, [role]: DEFAULT_RESEARCH_PROMPTS[role] })
        }
      >
        Reset {labels[role].toLowerCase()} instructions
      </button>
      <p className="agent-fine">
        Defaults save in this browser. Each run keeps its own copy.
      </p>
      <details className="research-required-rules">
        <summary>Required evidence rules</summary>
        <p className="agent-fine">
          NemoDoc adds these rules, the selected evidence, assignments, and
          execution limits to the editable instructions. The planner also
          receives the required team format and available model choices.
        </p>
        <pre>
          {role === "planner"
            ? PLANNER_REQUIRED_RULES
            : RESEARCH_EVIDENCE_RULES}
        </pre>
      </details>
    </section>
  );
}
