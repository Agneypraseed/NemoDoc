import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import type { Message } from "../types";
import "./answer-editor.css";

export function AnswerEditor({
  message,
  children,
  onSave,
  savedNotes,
}: {
  savedNotes?: string;
  message: Message;
  children: ReactNode;
  onSave: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (editing)
    return (
      <section className="answer-editor" aria-label="Edit answer">
        <label>
          Answer text
          <textarea
            aria-label="Answer text"
            autoFocus
            rows={12}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setEditing(false);
              }
              if (
                e.key === "Enter" &&
                (e.ctrlKey || e.metaKey) &&
                draft.trim()
              ) {
                e.preventDefault();
                onSave(draft);
                setEditing(false);
              }
            }}
          />
        </label>
        <p>
          Edit any words or Markdown, including lists and tables. Keep citation
          markers such as [1] beside supported claims.
        </p>
        <div>
          <button
            type="button"
            className="primary-button"
            disabled={!draft.trim()}
            onClick={() => {
              onSave(draft);
              setEditing(false);
            }}
          >
            Save changes
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </section>
    );
  return (
    <>
      <div className="answer-edit-actions">
        {!message.incomplete &&
          !message.cancelled &&
          message.content.trim() && (
            <button
              type="button"
              onClick={() => {
                setDraft(message.content);
                setEditing(true);
              }}
            >
              <Pencil size={13} />
              Edit answer
            </button>
          )}
        {!!message.editedAt && <span>Edited</span>}
      </div>
      {!!message.editedAt &&
        message.savedToNotes &&
        message.savedNoteText &&
        savedNotes !== undefined &&
        !savedNotes.includes(message.savedNoteText) && (
          <p role="status" className="answer-note-preserved">
            The notebook text was edited separately and has been preserved.
          </p>
        )}
      {children}
    </>
  );
}
