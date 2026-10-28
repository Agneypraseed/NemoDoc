import { useState } from "react";
import {
  type AnswerMode,
  type ConversationPrompts,
  DEFAULT_CONVERSATION_PROMPTS,
  MAX_CONVERSATION_PROMPT_LENGTH,
} from "../conversation-prompt-types";

export function ConversationPromptSettings({
  prompts,
  onChange,
  saveError,
}: {
  prompts: ConversationPrompts;
  onChange: (prompts: ConversationPrompts) => void;
  saveError: boolean;
}) {
  const [mode, setMode] = useState<AnswerMode>("quick");
  const updatePrompt = (value: string) =>
    onChange({ ...prompts, [mode]: value });
  const resetPrompt = () =>
    onChange({ ...prompts, [mode]: DEFAULT_CONVERSATION_PROMPTS[mode] });

  return (
    <section
      className="conversation-prompt-settings"
      aria-labelledby="prompt-settings-title"
    >
      <div className="conversation-prompt-intro">
        <h3 id="prompt-settings-title">Answer prompts</h3>
        <p>
          Edit the prompt used for each mode. NemoDoc adds the current source
          material and required citation or image evidence safeguards to each
          request.
        </p>
      </div>
      <div
        className="conversation-prompt-modes"
        role="group"
        aria-label="Answer mode prompt"
      >
        {(["quick", "deep"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            aria-controls="conversation-prompt-panel"
            onClick={() => setMode(value)}
          >
            {value === "quick" ? "Quick" : "Deep"}
          </button>
        ))}
      </div>
      <div
        id="conversation-prompt-panel"
        className="conversation-prompt-panel"
        role="region"
        aria-label={`${mode === "quick" ? "Quick" : "Deep"} prompt editor`}
      >
        <label
          className="conversation-prompt-field"
          htmlFor="conversation-prompt"
        >
          <span>
            {mode === "quick" ? "Quick system prompt" : "Deep system prompt"}
          </span>
          <textarea
            id="conversation-prompt"
            aria-label={`${mode === "quick" ? "Quick" : "Deep"} system prompt`}
            value={prompts[mode]}
            maxLength={MAX_CONVERSATION_PROMPT_LENGTH}
            rows={14}
            spellCheck
            onChange={(event) => updatePrompt(event.target.value)}
          />
        </label>
        <div className="conversation-prompt-footer">
          <span
            className={saveError ? "save-error" : "save-status"}
            role="status"
          >
            {saveError
              ? "Could not save to this browser. The change will last until this page closes."
              : "Changes save automatically in this browser."}
          </span>
          <span className="prompt-character-count">
            {prompts[mode].length.toLocaleString()} /{" "}
            {MAX_CONVERSATION_PROMPT_LENGTH.toLocaleString()}
          </span>
          <button
            type="button"
            className="conversation-prompt-reset"
            aria-label={`Reset ${mode} prompt to default`}
            disabled={prompts[mode] === DEFAULT_CONVERSATION_PROMPTS[mode]}
            onClick={resetPrompt}
          >
            Reset to default
          </button>
        </div>
      </div>
    </section>
  );
}
