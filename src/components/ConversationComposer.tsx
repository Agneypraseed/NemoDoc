import type { RefObject } from "react";
import {
  Sparkles,
  Square,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  NotebookPen,
  Grid2X2,
  Mic,
  Layers,
} from "lucide-react";
import { AnswerModeControl, type AnswerMode } from "./AnswerMode";
import { modelName } from "../lib/appearance";
import type { AIStatus } from "../types";
interface Props {
  preparingPrompt: boolean;
  answerMode: AnswerMode;
  status: AIStatus;
  composer: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  busy: boolean;
  activePassageNote: unknown;
  openConversation: () => void;
  setDraft: (s: string) => void;
  send: () => Promise<void>;
  onStop: () => void;
  notebookSources: unknown[];
  chatLauncher: RefObject<HTMLButtonElement | null>;
  panelOpen: boolean;
  tab: string;
  closeAssistant: () => void;
  topicNoteNext: boolean;
  setTopicNoteNext: (v: boolean | ((v: boolean) => boolean)) => void;
  suggestionsOpen: boolean;
  setSuggestionsOpen: (v: boolean) => void;
  voiceActive: boolean;
  voiceInputAvailable: boolean;
  toggleVoiceInput: () => void;
  setAnswerMode: (v: AnswerMode) => void;
  context: unknown;
  enabledSources: unknown[];
}
export function ConversationComposer({
  preparingPrompt,
  answerMode,
  status,
  composer,
  draft,
  busy,
  activePassageNote,
  openConversation,
  setDraft,
  send,
  onStop,
  notebookSources,
  chatLauncher,
  panelOpen,
  tab,
  closeAssistant,
  topicNoteNext,
  setTopicNoteNext,
  suggestionsOpen,
  setSuggestionsOpen,
  voiceActive,
  voiceInputAvailable,
  toggleVoiceInput,
  setAnswerMode,
  context,
  enabledSources,
}: Props) {
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {preparingPrompt && (
        <div className="prompt-rewrite-status" role="status">
          <Sparkles size={13} aria-hidden="true" />
          Refining your {answerMode === "quick" ? "Quick" : "Deep"} request with{" "}
          {modelName(status.model)}…
        </div>
      )}
      <div className="composer-input-row">
        <textarea
          ref={composer}
          aria-label="Ask about your sources"
          placeholder="Ask about your sources…"
          value={draft}
          maxLength={8000}
          disabled={preparingPrompt}
          onFocus={() => {
            if (activePassageNote) openConversation();
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
        />
        {busy ? (
          <button
            type="button"
            className="send-button stop"
            aria-label="Stop answer"
            title="Stop answer"
            onClick={() => onStop()}
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : preparingPrompt ? (
          <button
            type="button"
            className="send-button prompt-preparing"
            aria-label="Refining prompt"
            title="Refining your prompt with Nemotron"
            disabled
          >
            <Sparkles size={16} />
          </button>
        ) : (
          <button
            type="submit"
            className="send-button"
            aria-label="Send question"
            title="Send question"
            disabled={!draft.trim() || !notebookSources.length}
          >
            <MessageSquare size={18} />
          </button>
        )}
      </div>
      <div className="composer-layout">
        <div className="composer-tools">
          <button
            type="button"
            ref={chatLauncher}
            className="composer-chat-toggle"
            aria-label={
              panelOpen && tab === "chat" ? "Close chat" : "Open chat"
            }
            title={
              panelOpen && tab === "chat"
                ? "Hide conversation"
                : "Open conversation"
            }
            aria-expanded={panelOpen && tab === "chat"}
            aria-controls="notebook-assistant"
            onClick={() => {
              if (panelOpen && tab === "chat") closeAssistant();
              else openConversation();
            }}
          >
            {panelOpen && tab === "chat" ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronRight size={14} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={`composer-suggestions ${topicNoteNext ? "active" : ""}`}
            aria-label="Create a topic note from this question"
            aria-pressed={topicNoteNext}
            title={
              topicNoteNext
                ? "Turn off topic note for the next answer"
                : "Create a topic note from the next answer"
            }
            onClick={() => setTopicNoteNext((value) => !value)}
          >
            <NotebookPen size={15} />
            <span className="sr-only">
              {topicNoteNext ? "Topic note on" : "Create topic note"}
            </span>
          </button>
          <button
            type="button"
            className="composer-suggestions"
            aria-label="Suggestions"
            aria-expanded={suggestionsOpen}
            aria-controls="chat-suggestions"
            title="Suggested prompts"
            onClick={() => setSuggestionsOpen(!suggestionsOpen)}
          >
            <Grid2X2 size={15} />
            <span className="sr-only">Suggested prompts</span>
          </button>
          <button
            type="button"
            className={`composer-suggestions composer-voice ${voiceActive ? "active" : ""}`}
            aria-label={voiceActive ? "Stop voice input" : "Voice input"}
            aria-pressed={voiceActive}
            title={
              voiceInputAvailable
                ? "Dictate with browser speech recognition; audio may be processed online"
                : "Voice input is not available in this browser"
            }
            disabled={!voiceInputAvailable}
            onClick={toggleVoiceInput}
          >
            <Mic size={16} aria-hidden="true" />
          </button>
          <AnswerModeControl
            compact
            value={answerMode}
            onChange={setAnswerMode}
            disabled={preparingPrompt}
          />
          <span className="composer-source-count sr-only">
            <Layers size={13} />
            {context
              ? "Selected passage"
              : `${enabledSources.length} ${enabledSources.length === 1 ? "source" : "sources"}`}
          </span>
        </div>
        <span
          className="composer-model"
          title={status.configured ? status.model : undefined}
        >
          <span
            className={`status-dot ${status.configured ? "" : "offline"}`}
            aria-hidden="true"
          />
          {status.configured
            ? modelName(status.model)
            : "Choose a model in Settings"}
        </span>
      </div>
    </form>
  );
}
