import { useEffect, useRef, useState } from "react";
import { roleContent } from "../agent-config-types";

export function MarkdownFileInput({
  name = "AGENTS.md",
  disabled = false,
  onImport,
}: {
  name?: string;
  disabled?: boolean;
  onImport: (content: string) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const importContent = useRef(onImport);
  importContent.current = onImport;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <div>
      <label className="field-label">
        Import {name}
        <input
          type="file"
          accept=".md,.markdown,text/markdown"
          disabled={disabled || busy}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setError("");
            setBusy(true);
            try {
              if (!/\.(md|markdown)$/i.test(file.name))
                throw new Error("Choose a Markdown (.md) file.");
              if (file.size > 128000)
                throw new Error("Use at most 32,000 characters.");
              const content = await file.text();
              if (!roleContent.safeParse(content).success)
                throw new Error(
                  "Use at most 32,000 characters without control characters.",
                );
              if (mounted.current) importContent.current(content);
            } catch (error) {
              if (mounted.current) setError((error as Error).message);
            } finally {
              if (mounted.current) setBusy(false);
            }
          }}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
