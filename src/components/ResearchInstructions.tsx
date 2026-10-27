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
  const rendered = (
    <div className="agent-markdown-preview" aria-label="Instructions preview">
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
  );
  const exportInstructions = () =>
    download(
      new Blob([content], { type: "text/markdown;charset=utf-8" }),
      `${name.replace(/[^a-z0-9_-]/gi, "-")}-AGENTS.md`,
    );
  if (!onChange)
    return (
      <details className="agent-role-template">
        <summary>Instructions</summary>
        {rendered}
        <button
          type="button"
          className="text-button"
          onClick={exportInstructions}
        >
          Download .md
        </button>
      </details>
    );
  return (
    <section
      className="research-instructions"
      aria-label={`${name} instructions`}
    >
      {!preview ? (
        <label className="field-label">
          How this agent should work
          <textarea
            aria-label="How this agent should work"
            value={content}
            maxLength={32000}
            rows={3}
            placeholder="Use plain language, compare the evidence, and cite source pages. Add any approach or output format you prefer."
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      ) : (
        rendered
      )}
      <div className="workflow-buttons">
        <button
          type="button"
          className="text-button"
          aria-pressed={preview}
          onClick={() => setPreview(!preview)}
        >
          {preview ? "Edit instructions" : "Preview"}
        </button>
        <details className="agent-role-template">
          <summary>Import or export instructions</summary>
          <MarkdownFileInput
            name="Markdown file"
            onImport={(value) => {
              onChange(value);
              setPreview(false);
            }}
          />
          <button
            type="button"
            className="text-button"
            disabled={!content.trim()}
            onClick={exportInstructions}
          >
            Download .md
          </button>
        </details>
      </div>
    </section>
  );
}
