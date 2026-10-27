import type { AgentRun } from "../agent-types";
import type { TraceDetail, TraceEvent, TraceSpan } from "../trace-types";

export type FeedStatus =
  "running" | "completed" | "failed" | "interrupted" | "rejected";
export interface FeedSource {
  title: string;
  url?: string;
  excerpt?: string;
  citationId?: number;
  candidate: boolean;
}
export interface FeedAction {
  id: string;
  tool: string;
  label: string;
  status: FeedStatus;
  at: number;
  query?: string;
  url?: string;
  summary?: string;
  sources: FeedSource[];
}
export interface FeedAgent {
  id: string;
  name: string;
  kind: string;
  assignment?: string;
  model?: string;
  status: FeedStatus;
  stage?: string;
  findings?: string;
  error?: string;
  noEvidence?: boolean;
  at: number;
  actions: FeedAction[];
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, limit = 1200) =>
  typeof value === "string" ? value.slice(0, limit) : undefined;
const findings = (value: unknown) =>
  text(value, 32000)
    ?.replace(/<(think|analysis|reasoning)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(?:think|analysis|reasoning)\b[^>]*>[\s\S]*$/gi, "")
    .trim();
const status = (value: unknown): FeedStatus =>
  value === "failed" || value === "rejected" || value === "interrupted"
    ? value
    : value === "running" || value === "queued"
      ? "running"
      : "completed";

export function publicSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    /* A malformed provider URL is shown as plain source text. */
  }
}

const labels: Record<string, [string, string]> = {
  search_web: ["Searching the web", "Searched the web"],
  read_web: ["Reading a web page", "Read a web page"],
  read_web_page: ["Reading a web page", "Read a web page"],
  search_sources: ["Searching notebook sources", "Searched notebook sources"],
  read_passage: ["Reading a passage", "Read a passage"],
  read_file: ["Reading a selected file", "Read a selected file"],
  list_files: ["Finding selected files", "Listed selected files"],
  write_file: ["Creating a file", "Created a file"],
  delegate_agents: [
    "Working with specialists",
    "Specialists returned their findings",
  ],
  update_plan: ["Updating the plan", "Updated the plan"],
  save_study_material: ["Preparing study material", "Saved study material"],
  remember_progress: ["Recording progress", "Recorded progress"],
  schedule_review: ["Scheduling a review", "Scheduled a review"],
  propose_actions: [
    "Preparing actions for review",
    "Prepared actions for review",
  ],
  query_notes: ["Reading notebook notes", "Read notebook notes"],
  query_progress: ["Checking study progress", "Checked study progress"],
};
export function actionLabel(tool: string, active: boolean) {
  return labels[tool]?.[active ? 0 : 1] ?? tool.replaceAll("_", " ");
}
export const feedStageLabels: Record<string, string> = {
  queued: "Waiting to start",
  retrieving: "Gathering evidence",
  awaiting_model_response: "Working on the next step",
  validating: "Checking citations",
  synthesizing: "Preparing findings",
};

function sourceRows(value: unknown): FeedSource[] {
  const output = record(value);
  const candidates = Array.isArray(output.candidates)
    ? output.candidates
    : undefined;
  const rows =
    candidates ??
    (Array.isArray(value)
      ? value
      : output.citation
        ? [output.citation]
        : [value]);
  return rows.slice(0, 30).flatMap((item) => {
    const row = record(item);
    const title = text(row.sourceName ?? row.title, 250);
    const citationId =
      typeof row.id === "number" && row.id > 0 && Number.isInteger(row.id)
        ? row.id
        : undefined;
    const excerpt = text(row.text ?? row.snippet, 1600);
    if (!title || (!candidates && (!citationId || !excerpt))) return [];
    return [
      {
        title,
        url: publicSourceUrl(row.url),
        excerpt,
        citationId: candidates ? undefined : citationId,
        candidate: !!candidates,
      },
    ];
  });
}

/** Builds only public action summaries; model request/response text is deliberately excluded. */
export function buildAgentFeed(
  detail?: TraceDetail,
  events: TraceEvent[] = [],
  run?: AgentRun,
): FeedAgent[] {
  if (!detail && !run) return [];
  const spans = new Map<string, TraceSpan>(
    detail?.spans.map((span) => [span.spanId, span]) ?? [],
  );
  const groups = new Map<string, FeedAgent>();
  const delegatesBySpan = new Map(
    (run?.agents ?? []).flatMap((agent) =>
      agent.spanId ? [[agent.spanId, agent] as const] : [],
    ),
  );
  const assistant: FeedAgent = {
    id: "assistant",
    name: "Assistant",
    kind: "assistant",
    status: status(
      detail && !["running", "queued"].includes(detail.status)
        ? detail.status
        : (run?.status ?? detail?.status ?? "running"),
    ),
    stage: run?.stage,
    at: run?.startedAt ?? detail?.startedAt ?? detail?.createdAt ?? 0,
    model: run?.connection.model,
    actions: [],
  };
  groups.set(assistant.id, assistant);
  for (const span of spans.values()) {
    if (!["agent", "synthesis"].includes(span.kind)) continue;
    const id =
      delegatesBySpan.get(span.spanId)?.id ??
      text(span.attributes.agentId) ??
      (span.parentSpanId ? span.spanId : "assistant");
    if (id === "assistant") continue;
    groups.set(id, {
      id,
      name: span.name,
      kind: text(span.attributes.kind) ?? span.kind,
      assignment: text(span.attributes.assignment),
      model: text(span.attributes.configuredModel ?? span.attributes.model),
      error: text(span.error),
      status: status(span.status),
      at: span.startedAt,
      actions: [],
    });
  }
  for (const agent of run?.agents ?? []) {
    const previous = groups.get(agent.id);
    groups.set(agent.id, {
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      assignment: agent.assignment,
      model: agent.model,
      findings:
        agent.status === "completed" ? findings(agent.answer) : undefined,
      error: text(agent.error) ?? previous?.error,
      noEvidence: agent.noEvidence,
      status:
        previous && previous.status !== "running"
          ? previous.status
          : status(agent.status),
      at: agent.startedAt,
      actions: previous?.actions ?? [],
    });
  }
  const owner = (spanId?: string) => {
    const seen = new Set<string>();
    while (spanId && !seen.has(spanId)) {
      seen.add(spanId);
      const span = spans.get(spanId);
      if (!span) break;
      const id =
        delegatesBySpan.get(span.spanId)?.id ?? text(span.attributes.agentId);
      if (id && groups.has(id)) return groups.get(id)!;
      if (groups.has(span.spanId)) return groups.get(span.spanId)!;
      spanId = span.parentSpanId;
    }
    return assistant;
  };
  const actions = new Map<string, FeedAction>();
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const group =
      groups.get(text(event.payload.agentId) ?? "") ?? owner(event.spanId);
    if (event.type === "agent.completed" && group.id !== "assistant") {
      group.findings = findings(event.payload.answer);
      group.noEvidence = event.payload.noEvidence === true;
      group.status = "completed";
      continue;
    }
    if (event.type === "agent.failed" && group.id !== "assistant") {
      group.error = text(event.payload.error);
      if (group.status !== "interrupted") group.status = "failed";
      continue;
    }
    if (event.type === "stage.changed") {
      group.stage = text(event.payload.stage);
      continue;
    }
    if (event.type !== "tool.call" && event.type !== "tool.result") continue;
    const tool = text(event.payload.tool, 100);
    if (!tool) continue;
    const key = event.spanId ?? event.eventId;
    let action = actions.get(key);
    if (!action) {
      action = {
        id: key,
        tool,
        label: actionLabel(tool, true),
        status: "running",
        at: event.at,
        sources: [],
      };
      actions.set(key, action);
      group.actions.push(action);
    }
    if (event.type === "tool.call") {
      let args = record(event.payload.arguments);
      try {
        if (typeof event.payload.arguments === "string")
          args = record(JSON.parse(event.payload.arguments));
      } catch {
        /* Invalid tool arguments are represented by the recorded error. */
      }
      action.query = text(args.query);
      action.url = publicSourceUrl(args.url);
    } else {
      const result = record(event.payload.result);
      action.status = result.error ? "failed" : status(event.payload.status);
      action.label = actionLabel(tool, false);
      action.summary = text(event.payload.summary ?? result.error);
      // Only retrieval tools can yield evidence rows; writes and drafts never become evidence.
      if (
        [
          "search_web",
          "read_web",
          "read_web_page",
          "read_passage",
          "search_sources",
          "read_file",
        ].includes(tool)
      )
        action.sources = sourceRows(event.payload.result);
    }
  }
  for (const action of actions.values()) {
    const span = spans.get(action.id);
    if (action.status === "running" && span && span.status !== "running") {
      action.status = status(span.status);
      action.summary = text(span.error);
      action.label = actionLabel(action.tool, false);
    }
    if (
      action.status === "running" &&
      detail &&
      !["running", "queued"].includes(detail.status)
    ) {
      action.status = "interrupted";
      action.summary = "No completion was recorded for this action.";
      action.label = actionLabel(action.tool, false);
    }
  }
  if (!actions.size)
    for (const [index, step] of (run?.steps ?? []).entries()) {
      const group = (step.agentId && groups.get(step.agentId)) || assistant;
      group.actions.push({
        id: `step-${index}`,
        tool: step.tool,
        label: actionLabel(step.tool, false),
        status: status(step.status),
        at: step.at,
        summary: step.summary,
        sources: [],
      });
    }
  for (const group of groups.values()) {
    if (
      group.status === "running" &&
      detail &&
      !["running", "queued"].includes(detail.status)
    )
      group.status = "interrupted";
  }
  return [...groups.values()]
    .filter(
      (group) =>
        group.id !== "assistant" || group.actions.length || groups.size === 1,
    )
    .sort((a, b) => a.at - b.at);
}
