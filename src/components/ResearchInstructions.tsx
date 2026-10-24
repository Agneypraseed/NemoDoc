import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { download } from "../lib/storage";
import { MarkdownFileInput } from "./MarkdownFileInput";

export function ResearchInstructions({
  name,
  content,
  onChange,
}: {
  name: string;
  content: string;
  onChange?: (content: string) => void;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <details className="agent-role-template">
      <summary>AGENTS.md instructions</summary>
      {onChange && (
        <>
          <p className="agent-fine">
            Saved with this run. Import a Markdown file to reuse it with another
            agent or task. Evidence and tool permissions still apply.
          </p>
          <MarkdownFileInput onImport={onChange} />
          <button
            type="button"
            className="text-button"
            onClick={() => setPreview(!preview)}
          >
            {preview ? "Edit Markdown" : "Preview Markdown"}
          </button>
        </>
      )}
      {onChange && !preview ? (
        <label className="field-label">
          Agent instructions
          <textarea
            aria-label="AGENTS.md content"
            className="agent-markdown-input"
            value={content}
            maxLength={32000}
            rows={8}
            spellCheck={false}
            placeholder="# Role\n\nGoals, approach, output format and limits…"
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      ) : (
        <div className="agent-markdown-preview" aria-label="AGENTS.md preview">
          <ReactMarkdown
            skipHtml
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ children }) => <span>{children}</span>,
              img: ({ alt }) => <span>{alt || "Image omitted"}</span>,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
      <button
        type="button"
        className="secondary-button"
        onClick={() =>
          download(
            new Blob([content], { type: "text/markdown;charset=utf-8" }),
            `${name.replace(/[^a-z0-9_-]/gi, "-")}-AGENTS.md`,
          )
        }
      >
        Download AGENTS.md
      </button>
    </details>
  );
}
