import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  agentFileInput,
  agentFileLimit,
  type AgentFile,
} from "../src/agent-file-types.ts";
import type { AgentTask, AgentRun } from "../src/agent-types.ts";
import type { AgentStore } from "./agent-store.ts";

export class ToolAccessError extends Error {}
export const fileErrorMessage = (error: unknown) =>
  error && typeof error === "object" && "code" in error
    ? "The local agent file is unavailable. Check storage space and file permissions."
    : error instanceof Error
      ? error.message
      : "The agent file operation failed.";

/** Model arguments never become host paths. Files use generated IDs in a dedicated sandbox. */
export class AgentFiles {
  private memory = new Map<string, string>();
  constructor(
    private data: AgentStore,
    private directory?: string,
  ) {}

  list(notebookId: string) {
    return (this.data.state.files ?? []).filter(
      (f) => f.notebookId === notebookId,
    );
  }
  private metadata(notebookId: string, id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new ToolAccessError("Invalid file ID.");
    const file = this.list(notebookId).find((f) => f.id === id);
    if (!file)
      throw new ToolAccessError(
        "File is outside this notebook's approved workspace.",
      );
    return file;
  }
  approved(task: AgentTask, run?: AgentRun) {
    return [
      ...new Set([
        ...(task.fileIds ?? []),
        ...(run?.files ?? []).map((f) => f.id),
      ]),
    ].map((id) => this.metadata(task.notebookId, id));
  }
  assertReadable(task: AgentTask, id: string, run: AgentRun) {
    const file = this.approved(task, run).find((f) => f.id === id);
    if (!file)
      throw new ToolAccessError("File was not selected for this task.");
    return file;
  }
  private filename(file: AgentFile) {
    const root = path.resolve(this.directory!);
    mkdirSync(root, { recursive: true });
    if (lstatSync(root).isSymbolicLink())
      throw new ToolAccessError("Linked agent workspaces are not allowed.");
    const notebook = createHash("sha256").update(file.notebookId).digest("hex");
    const folder = path.join(root, notebook);
    mkdirSync(folder, { recursive: true });
    if (
      lstatSync(folder).isSymbolicLink() ||
      path.relative(realpathSync(root), realpathSync(folder)) !== notebook
    )
      throw new ToolAccessError(
        "File storage must stay inside the agent workspace.",
      );
    if (!z.uuid().safeParse(file.id).success)
      throw new ToolAccessError("Invalid file ID.");
    return path.join(folder, file.id + ".txt");
  }
  read(notebookId: string, id: string) {
    const file = this.metadata(notebookId, id);
    let content: string;
    if (this.directory) {
      const filename = this.filename(file);
      const stat = lstatSync(filename);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== 1 ||
        stat.size > agentFileLimit
      )
        throw new ToolAccessError(
          "Only bounded, regular workspace text files can be read.",
        );
      const descriptor = openSync(filename, "r");
      try {
        const opened = fstatSync(descriptor);
        if (
          opened.ino !== stat.ino ||
          opened.dev !== stat.dev ||
          opened.size > agentFileLimit ||
          opened.nlink !== 1
        )
          throw new ToolAccessError(
            "The workspace file changed while opening it.",
          );
        content = readFileSync(descriptor, "utf8");
      } finally {
        closeSync(descriptor);
      }
    } else {
      content = this.memory.get(id) ?? "";
    }
    if (
      Buffer.byteLength(content, "utf8") > agentFileLimit ||
      content.includes("\0")
    )
      throw new ToolAccessError("Only text files up to 64 KiB can be read.");
    return { file, content };
  }
  create(input: unknown, output?: { runId: string; citationIds: number[] }) {
    const args = agentFileInput.parse(input);
    const bytes = Buffer.byteLength(args.content, "utf8");
    if (bytes > agentFileLimit)
      throw new ToolAccessError("Text files are limited to 64 KiB.");
    const files = this.list(args.notebookId);
    if (
      files.length >= 100 ||
      files.reduce((n, f) => n + f.bytes, 0) + bytes > 2 * 1024 * 1024
    )
      throw new ToolAccessError(
        "Notebook file storage is full (100 files or 2 MiB).",
      );
    const file: AgentFile = {
      id: randomUUID(),
      notebookId: args.notebookId,
      name: args.name,
      bytes,
      createdAt: Date.now(),
      origin: output ? "agent" : "upload",
      ...output,
    };
    const filename = this.directory ? this.filename(file) : undefined;
    if (filename)
      writeFileSync(filename, args.content, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
    else this.memory.set(file.id, args.content);
    this.data.state.files ??= [];
    this.data.state.files.push(file);
    try {
      this.data.flush();
    } catch (error) {
      this.data.state.files = this.data.state.files.filter(
        (f) => f.id !== file.id,
      );
      if (filename) unlinkSync(filename);
      this.memory.delete(file.id);
      throw error;
    }
    return file;
  }
  clear() {
    // Unlink only registered, generated filenames; never recursively delete a computed path.
    for (const file of this.data.state.files ?? []) {
      if (this.directory) {
        const filename = this.filename(file);
        if (existsSync(filename)) unlinkSync(filename);
      }
      this.memory.delete(file.id);
    }
    this.data.state.files = [];
  }
}
