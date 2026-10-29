import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Modal } from "./Modal";
import { storage } from "../lib/storage";
import type { Notebook } from "../types";
export function NotebookCreateDialog({
  onClose,
  className = "",
}: {
  onClose: () => void;
  className?: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    setError("");
    const notebook: Notebook = {
      id: crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      createdAt: Date.now(),
      notes: "",
      messages: [],
    };
    try {
      await storage.notebook(notebook);
      window.location.assign(
        `/app?notebook=${encodeURIComponent(notebook.id)}`,
      );
    } catch {
      setCreating(false);
      setError(
        "Could not save the notebook. Check browser storage and try again.",
      );
    }
  };
  return (
    <Modal
      title="New notebook"
      className={className}
      onClose={() => {
        if (!creating) onClose();
      }}
    >
      <form onSubmit={(event) => void create(event)}>
        <label className="form-label">
          Notebook title
          <input
            autoFocus
            data-modal-autofocus
            placeholder="Notebook title"
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label className="form-label">
          Description <span>optional</span>
          <input
            placeholder="Description (optional)"
            maxLength={160}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button modal-submit"
          type="submit"
          disabled={!title.trim() || creating}
        >
          <Plus size={16} />
          {creating ? "Creating…" : "Create notebook"}
        </button>
      </form>
    </Modal>
  );
}
