import { useEffect, useRef, useState } from "react";
import { Download, MoreHorizontal, Upload, Archive } from "lucide-react";

export function NotebookActions({
  disabled,
  onExport,
  onBackup,
  onRestore,
}: {
  disabled: boolean;
  onExport: () => void;
  onBackup: () => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const choose = (action: () => void) => {
    setOpen(false);
    trigger.current?.focus();
    action();
  };
  return (
    <div className="notebook-actions" ref={container}>
      <button
        className="icon-button"
        ref={trigger}
        aria-label="Notebook actions"
        title="Notebook actions"
        aria-expanded={open}
        aria-controls="notebook-actions"
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={19} />
      </button>
      {open && (
        <div
          className="notebook-actions-popover"
          id="notebook-actions"
          role="group"
          aria-label="Notebook actions"
        >
          <button
            disabled={disabled}
            aria-label="Export notes"
            onClick={() => choose(onExport)}
          >
            <Download size={16} />
            <span>
              Export notes<small>Markdown document (.md)</small>
            </span>
          </button>
          <button
            disabled={disabled}
            aria-label="Back up notebook"
            onClick={() => choose(onBackup)}
          >
            <Archive size={16} />
            <span>
              Back up notebook<small>Sources, notes & chat (.zip)</small>
            </span>
          </button>
          <button aria-label="Restore backup" onClick={() => choose(onRestore)}>
            <Upload size={16} />
            <span>
              Restore backup<small>Open a saved notebook ZIP</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
