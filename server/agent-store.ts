import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import type { AgentState, RuntimeReceipt } from "../src/agent-types.ts";

export const defaultSkills = [
  {
    id: "paper-review",
    name: "Review a paper",
    instructions:
      "Search the permitted sources. Explain the main claim, evidence, limitations and open questions with page citations. Save a cited study guide.",
  },
  {
    id: "weekly-briefing",
    name: "Weekly briefing",
    instructions:
      "Read my goals and progress. Search permitted sources for relevant themes. Save a concise cited briefing and update my study plan with achievable next steps.",
  },
  {
    id: "weak-topics",
    name: "Quiz weak topics",
    instructions:
      "Use my progress memories to focus on weak topics. Search the permitted sources and save at least three cited multiple-choice quiz questions with answers and explanations.",
  },
  {
    id: "exam-prep",
    name: "Prepare for an exam",
    instructions:
      "Use my goal, deadline, preferences and progress. Search permitted sources. Build a dated realistic study plan, save cited practice flashcards, and schedule one review if authorized.",
  },
];
export class AgentStore {
  state: AgentState = {
    version: 1,
    memories: [],
    skills: structuredClone(defaultSkills),
    sources: [],
    tasks: [],
    runs: [],
    plans: [],
    receipts: [],
  };
  constructor(private filename?: string) {
    if (filename && existsSync(filename)) {
      // This is a trusted local file written by this server, not the import boundary.
      const value = JSON.parse(readFileSync(filename, "utf8")) as AgentState;
      if (
        value.version !== 1 ||
        ![
          "memories",
          "skills",
          "sources",
          "tasks",
          "runs",
          "plans",
          "receipts",
        ].every((key) => Array.isArray((value as any)[key]))
      )
        throw new Error(
          "Agent data could not be loaded. Preserve data/agent.json before repairing it.",
        );
      this.state = value;
      for (const run of value.runs)
        if (run.status === "running") {
          run.status = "interrupted";
          run.finishedAt = Date.now();
          run.error =
            "The server stopped during this run. Review its actions before running again.";
        }
      this.flush();
    }
  }
  flush() {
    if (!this.filename) return;
    mkdirSync(path.dirname(this.filename), { recursive: true });
    writeFileSync(this.filename + ".tmp", JSON.stringify(this.state), {
      mode: 0o600,
    });
    renameSync(this.filename + ".tmp", this.filename);
  }
  receipt(receipt: RuntimeReceipt) {
    this.state.receipts.unshift(receipt);
    this.state.receipts = this.state.receipts.slice(0, 20);
    this.flush();
  }
  public() {
    return {
      ...this.state,
      sources: this.state.sources.map(({ pages, ...s }) => ({
        ...s,
        pageCount: pages.length,
        characters: pages.reduce((n, p) => n + p.length, 0),
      })),
    };
  }
}
