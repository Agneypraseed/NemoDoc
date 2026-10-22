import type { TraceEvent, TraceSummary } from "../src/trace-types.ts";
import type {
  DashboardTrace,
  DashboardModelUsage,
} from "../src/agent-dashboard-types.ts";

/** Only non-content telemetry leaves this aggregation boundary. */
export function dashboardTraces(
  traces: TraceSummary[],
  events: TraceEvent[],
): DashboardTrace[] {
  const rows = new Map(
    traces.map((t) => [
      t.traceId,
      {
        traceId: t.traceId,
        name: t.name,
        request:
          typeof t.metadata.request === "string"
            ? t.metadata.request.slice(0, 240)
            : undefined,
        status: t.status,
        createdAt: t.createdAt,
        durationMs: t.durationMs,
        kind:
          t.name === "Research plan"
            ? "plan"
            : t.metadata.workflow === "research_team"
              ? "research"
              : "task",
        models: [],
        toolCalls: 0,
        citationChecksPassed: 0,
        citationChecksFailed: 0,
      } as DashboardTrace,
    ]),
  );
  const requests = new Map<string, DashboardModelUsage>();
  const known = new Set<string>();
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const row = rows.get(event.traceId);
    if (!row || known.has(event.eventId)) continue;
    known.add(event.eventId);
    const payload = event.payload;
    if (event.type === "tool.call") row.toolCalls++;
    if (event.type === "citation.validation") {
      if (payload.valid === true) row.citationChecksPassed++;
      if (payload.valid === false) row.citationChecksFailed++;
    }
    const requestKey = `${event.traceId}:${event.spanId ?? "root"}:${event.attempt ?? 0}`;
    if (event.type === "model.request") {
      const model =
        typeof payload.model === "string" ? payload.model : "Unknown model";
      let provider = "Unknown provider";
      try {
        provider = new URL(String(payload.url)).origin;
      } catch {
        /* Legacy event. */
      }
      const key = `${provider}|${model}`;
      let usage = row.models.find((m) => m.key === key);
      if (!usage) {
        usage = {
          key,
          model,
          provider,
          calls: 0,
          responses: 0,
          failed: 0,
          promptTokens: 0,
          completionTokens: 0,
          usageReports: 0,
        };
        row.models.push(usage);
      }
      usage.calls++;
      requests.set(requestKey, usage);
    }
    if (event.type === "model.response") {
      const usage = requests.get(requestKey);
      if (!usage) continue;
      usage.responses++;
      if (typeof payload.httpStatus === "number" && payload.httpStatus >= 400)
        usage.failed++;
      const input = payload.promptTokens,
        output = payload.completionTokens;
      if (
        typeof input === "number" &&
        Number.isFinite(input) &&
        input >= 0 &&
        typeof output === "number" &&
        Number.isFinite(output) &&
        output >= 0
      ) {
        usage.promptTokens += input;
        usage.completionTokens += output;
        usage.usageReports++;
      }
      // One observer response per request; avoid accidental duplicate accounting.
      requests.delete(requestKey);
    }
  }
  return [...rows.values()];
}
