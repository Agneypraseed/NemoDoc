import { apiJSON } from "./api";
import type { TraceDetail, TraceEvent, TraceEventPage } from "../trace-types";

export async function readCompleteTrace(
  notebookId: string,
  traceId: string,
  signal?: AbortSignal,
) {
  const root = `/api/agent/workspace/${encodeURIComponent(notebookId)}/traces/${encodeURIComponent(traceId)}`;
  const initial = await apiJSON<TraceDetail>(root, undefined, signal);
  const events: TraceEvent[] = [];
  let cursor = 0;
  for (;;) {
    const page = await apiJSON<TraceEventPage>(
      `${root}/events?after=${cursor}&limit=500`,
      undefined,
      signal,
    );
    events.push(...page.events);
    if (!page.hasMore) break;
    if (page.nextCursor <= cursor || events.length >= 50000)
      throw new Error("This trace is too large to export in one request.");
    cursor = page.nextCursor;
  }
  const trace = await apiJSON<TraceDetail>(root, undefined, signal);
  return {
    trace,
    events,
    exportedAt: Date.now(),
    snapshotOfActiveRun: [initial, trace].some(
      (t) => t.status === "queued" || t.status === "running",
    ),
  };
}
