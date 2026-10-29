import { MessageSquare, NotebookPen, Layers, Bot, Network } from "lucide-react";

export type WorkspaceTab = "chat" | "notes" | "studio" | "agent" | "graph";

export function WorkspaceTabs({
  active,
  open,
  onSelect,
}: {
  active: WorkspaceTab;
  open: boolean;
  onSelect: (tab: WorkspaceTab) => void;
}) {
  return (
    <div className="workspace-tabs" role="group" aria-label="Workspace views">
      {(
        [
          ["chat", "Chat", MessageSquare],
          ["notes", "Notes", NotebookPen],
          ["studio", "Studio", Layers],
          ["agent", "Agent", Bot],
          ["graph", "Graph", Network],
        ] as const
      ).map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={open && active === value}
          onClick={() => onSelect(value)}
        >
          <Icon size={15} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
