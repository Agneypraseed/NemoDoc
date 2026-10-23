import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { dashboardTraces } from "./trace-dashboard.ts";
import type { AgentDashboardData } from "../src/agent-dashboard-types.ts";
import type {
  TraceDetail,
  TraceEvent,
  TraceEventPage,
  TraceMetrics,
  TracePersistence,
  TraceSpan,
  TraceStatus,
  TraceSummary,
} from "../src/trace-types.ts";

type Runner = TraceSummary["runner"];
type TraceStarted = {
  traceId: string;
  notebookId: string;
  runner: Runner;
  name: string;
  status: TraceStatus;
  createdAt: number;
  startedAt?: number;
  metadata?: Record<string, unknown>;
};
type EventInput = Omit<TraceEvent, "eventId" | "sequence"> & {
  eventId?: string;
  sequence?: number;
};

const privateField =
  /^(?:reasoning(?:_[a-z0-9]+)*|analysis(?:_[a-z0-9]+)*|chain_of_thought|thoughts|scratchpad)$/i;
const credentialField =
  /(?:api.?key|access.?token|refresh.?token|password|secret|authorization|credential)/i;
const cleanSecrets = (value: string, secrets: string[]) => {
  let clean = value
    .replace(
      /<(?:think|analysis|reasoning)>[\s\S]*?<\/(?:think|analysis|reasoning)>/gi,
      "[reasoning omitted]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|nvapi|nvidia)-[A-Za-z0-9_-]{12,}\b/g, "[redacted]");
  for (const secret of secrets)
    if (secret) clean = clean.split(secret).join("[redacted]");
  return clean.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
};

function redacted(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") return cleanSecrets(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redacted(item, secrets));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (privateField.test(key) || credentialField.test(key)) continue;
      output[key] = redacted(child, secrets);
    }
    return output;
  }
  return value;
}

const rootFromPayload = (event: TraceEvent): TraceSummary | undefined => {
  if (event.type !== "trace.started") return;
  const root = event.payload.root as TraceStarted | undefined;
  if (!root) return;
  return {
    ...root,
    metadata: (root.metadata || {}) as Record<string, unknown>,
    persistence: "degraded",
  };
};

export class TraceHandle {
  private sequence: number;
  constructor(
    private store: TraceStore,
    readonly traceId: string,
    readonly notebookId: string,
    sequence = 0,
    private startedAt = Date.now(),
  ) {
    this.sequence = sequence;
  }
  async event(
    type: string,
    payload: Record<string, unknown> = {},
    options: {
      spanId?: string;
      attempt?: number;
      at?: number;
      required?: boolean;
    } = {},
  ) {
    this.sequence++;
    return this.store.append(
      {
        eventId: randomUUID(),
        traceId: this.traceId,
        sequence: this.sequence,
        notebookId: this.notebookId,
        spanId: options.spanId,
        at: options.at ?? Date.now(),
        type,
        attempt: options.attempt,
        payload,
      },
      options.required,
    );
  }
  async span(
    name: string,
    kind: string,
    options: {
      parentSpanId?: string;
      attempt?: number;
      attributes?: Record<string, unknown>;
    } = {},
  ) {
    const spanId = randomUUID();
    const startedAt = Date.now();
    await this.event(
      "span.started",
      {
        span: {
          spanId,
          parentSpanId: options.parentSpanId,
          name,
          kind,
          status: "running",
          startedAt,
          attempt: options.attempt,
          attributes: options.attributes ?? {},
        },
      },
      { spanId, attempt: options.attempt, at: startedAt },
    );
    return new TraceSpanHandle(this, spanId, startedAt, options.attempt);
  }
  finish(status: TraceStatus, error?: string, at = Date.now()) {
    return this.event(
      "trace.finished",
      { status, error, durationMs: Math.max(0, at - this.startedAt) },
      { at },
    );
  }
  currentSequence() {
    return this.sequence;
  }
  status(status: TraceStatus, payload: Record<string, unknown> = {}) {
    return this.event("trace.status", { status, ...payload });
  }
}

export class TraceSpanHandle {
  constructor(
    private trace: TraceHandle,
    readonly spanId: string,
    readonly startedAt: number,
    readonly attempt?: number,
  ) {}
  event(type: string, payload: Record<string, unknown> = {}, required = false) {
    return this.trace.event(type, payload, {
      spanId: this.spanId,
      attempt: this.attempt,
      required,
    });
  }
  finish(
    status: TraceSpan["status"],
    attributes: Record<string, unknown> = {},
    error?: string,
    at = Date.now(),
  ) {
    return this.event("span.finished", {
      status,
      finishedAt: at,
      durationMs: Math.max(0, at - this.startedAt),
      attributes,
      error,
    });
  }
}

export class TraceStore {
  private pool?: Pool;
  private serial: Promise<unknown> = Promise.resolve();
  private sequences = new Map<string, number>();
  private persistence: TracePersistence = "degraded";

  constructor(
    databaseUrl: string | undefined,
    private spoolFile: string,
    private secrets: () => string[] = () => [],
  ) {
    if (databaseUrl)
      this.pool = new Pool({
        connectionString: databaseUrl,
        max: 3,
        statement_timeout: 10000,
      });
  }

  status(): TracePersistence {
    return this.persistence;
  }

  async initialize() {
    if (!this.pool) return;
    try {
      await this.pool.query("SELECT 1 FROM agent_traces LIMIT 0");
      await this.exclusive(() => this.replayLocked());
      this.persistence = "persisted";
    } catch {
      this.persistence = "degraded";
    }
  }

  async start(input: TraceStarted) {
    const sequence = await this.sequenceFor(input.traceId);
    const handle = new TraceHandle(
      this,
      input.traceId,
      input.notebookId,
      sequence,
      input.startedAt ?? input.createdAt,
    );
    await handle.event(
      "trace.started",
      {
        root: {
          ...input,
          startedAt: input.startedAt ?? input.createdAt,
          metadata: input.metadata ?? {},
        },
      },
      { at: input.createdAt },
    );
    return handle;
  }

  async resume(traceId: string, notebookId: string) {
    let startedAt = Date.now();
    if (this.pool)
      try {
        const result = await this.pool.query(
          "SELECT started_at FROM agent_traces WHERE trace_id=$1 AND notebook_id=$2",
          [traceId, notebookId],
        );
        if (result.rows[0]) startedAt = Number(result.rows[0].started_at);
      } catch {
        // The spool may contain the matching root event during an outage.
      }
    const root = this.readSpool()
      .filter(
        (event) => event.traceId === traceId && event.type === "trace.started",
      )
      .at(-1)?.payload.root as TraceStarted | undefined;
    if (root) startedAt = root.startedAt ?? root.createdAt;
    return new TraceHandle(
      this,
      traceId,
      notebookId,
      await this.sequenceFor(traceId),
      startedAt,
    );
  }

  async markInterrupted(traceId: string, notebookId: string, error: string) {
    const detail = await this.detail(notebookId, traceId);
    if (!detail || (detail.status !== "running" && detail.status !== "queued"))
      return;
    const trace = await this.resume(traceId, notebookId);
    const finishedAt = Date.now();
    for (const span of detail.spans)
      if (span.status === "running")
        await trace.event(
          "span.finished",
          {
            status: "interrupted",
            finishedAt,
            durationMs: Math.max(0, finishedAt - span.startedAt),
            attributes: { recoveredAfterRestart: true },
            error,
          },
          { spanId: span.spanId, attempt: span.attempt, at: finishedAt },
        );
    await trace.finish("interrupted", error, finishedAt);
  }

  async append(input: EventInput, required = false) {
    const safe = redacted(input, this.secrets()) as TraceEvent;
    console.info(
      JSON.stringify({
        event: "agent.trace.event",
        traceId: safe.traceId,
        spanId: safe.spanId,
        eventId: safe.eventId,
        sequence: safe.sequence,
        type: safe.type,
        at: safe.at,
      }),
    );
    await this.exclusive(async () => {
      if (this.pool) {
        try {
          await this.replayLocked();
          await this.writeEvent(safe);
          this.persistence = "persisted";
          this.sequences.set(
            safe.traceId,
            Math.max(this.sequences.get(safe.traceId) ?? 0, safe.sequence),
          );
          return;
        } catch {
          // Store the same event ID locally; a commit with a lost acknowledgement
          // is safe because replay uses the unique event ID.
        }
      }
      try {
        this.writeSpool(safe);
        this.persistence = "degraded";
        this.sequences.set(
          safe.traceId,
          Math.max(this.sequences.get(safe.traceId) ?? 0, safe.sequence),
        );
      } catch {
        this.persistence = "degraded";
        console.warn(
          JSON.stringify({
            event: "agent.trace.spool_write_failed",
            traceId: safe.traceId,
            spanId: safe.spanId,
            eventId: safe.eventId,
            sequence: safe.sequence,
          }),
        );
        if (required)
          throw new Error(
            "The audit log is unavailable. No tool action was taken.",
          );
      }
    });
    return this.persistence;
  }

  private async sequenceFor(traceId: string) {
    const known = this.sequences.get(traceId);
    if (known !== undefined) return known;
    let sequence = 0;
    if (this.pool) {
      try {
        const result = await this.pool.query(
          "SELECT last_sequence FROM agent_traces WHERE trace_id=$1",
          [traceId],
        );
        sequence = Number(result.rows[0]?.last_sequence ?? 0);
      } catch {
        // The spool remains the local source during an outage.
      }
    }
    for (const event of this.readSpool())
      if (event.traceId === traceId)
        sequence = Math.max(sequence, event.sequence);
    this.sequences.set(traceId, sequence);
    return sequence;
  }

  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const next = this.serial.then(action);
    this.serial = next.catch(() => {});
    return next;
  }

  private readSpool(): TraceEvent[] {
    if (!existsSync(this.spoolFile)) return [];
    try {
      return readFileSync(this.spoolFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          try {
            const value = JSON.parse(line) as TraceEvent;
            return value.eventId &&
              value.traceId &&
              Number.isInteger(value.sequence)
              ? [value]
              : [];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  }

  private writeSpool(event: TraceEvent) {
    mkdirSync(path.dirname(this.spoolFile), { recursive: true });
    if (existsSync(this.spoolFile)) chmodSync(this.spoolFile, 0o600);
    const fd = openSync(this.spoolFile, "a", 0o600);
    try {
      writeSync(fd, `${JSON.stringify(event)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  private async replayLocked() {
    if (!this.pool || !existsSync(this.spoolFile)) return;
    const events = this.readSpool();
    if (!events.length) return;
    for (const event of events) await this.writeEvent(event);
    const temporary = `${this.spoolFile}.replayed`;
    writeFileSync(temporary, "", { mode: 0o600 });
    renameSync(temporary, this.spoolFile);
    for (const event of events)
      this.sequences.set(
        event.traceId,
        Math.max(this.sequences.get(event.traceId) ?? 0, event.sequence),
      );
  }

  private async writeEvent(event: TraceEvent) {
    const pool = this.pool;
    if (!pool) throw new Error("PostgreSQL trace storage is not configured.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const duplicate = await client.query(
        "SELECT 1 FROM agent_trace_events WHERE event_id=$1",
        [event.eventId],
      );
      if (duplicate.rowCount) {
        await client.query("COMMIT");
        return;
      }
      if (event.type === "trace.started") {
        const root = event.payload.root as TraceStarted;
        await client.query(
          `INSERT INTO agent_traces(trace_id,notebook_id,runner,name,status,created_at,started_at,metadata,last_sequence)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,0) ON CONFLICT(trace_id) DO NOTHING`,
          [
            root.traceId,
            root.notebookId,
            root.runner,
            root.name,
            root.status,
            root.createdAt,
            root.startedAt ?? root.createdAt,
            JSON.stringify(root.metadata ?? {}),
          ],
        );
      }
      if (event.type === "span.started") {
        const span = event.payload.span as TraceSpan;
        await client.query(
          `INSERT INTO agent_trace_spans(trace_id,span_id,parent_span_id,name,kind,status,started_at,attempt,attributes)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(span_id) DO NOTHING`,
          [
            event.traceId,
            span.spanId,
            span.parentSpanId ?? null,
            span.name,
            span.kind,
            span.status,
            span.startedAt,
            span.attempt ?? null,
            JSON.stringify(span.attributes ?? {}),
          ],
        );
      }
      if (event.type === "span.finished") {
        await client.query(
          `UPDATE agent_trace_spans SET status=$2,finished_at=$3,duration_ms=$4,error=$5,
           attributes=attributes || $6::jsonb WHERE trace_id=$1 AND span_id=$7`,
          [
            event.traceId,
            event.payload.status,
            event.payload.finishedAt,
            event.payload.durationMs,
            event.payload.error ?? null,
            JSON.stringify(event.payload.attributes ?? {}),
            event.spanId,
          ],
        );
      }
      if (event.type === "trace.finished")
        await client.query(
          `UPDATE agent_traces SET status=$2,finished_at=$3,duration_ms=$4,error=$5 WHERE trace_id=$1`,
          [
            event.traceId,
            event.payload.status,
            event.at,
            event.payload.durationMs ?? null,
            event.payload.error ?? null,
          ],
        );
      if (event.type === "trace.status")
        await client.query(
          "UPDATE agent_traces SET status=$2,started_at=COALESCE(started_at,$3) WHERE trace_id=$1",
          [event.traceId, event.payload.status, event.at],
        );
      await client.query(
        `INSERT INTO agent_trace_events(event_id,trace_id,sequence,notebook_id,span_id,event_type,attempt,at,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
        [
          event.eventId,
          event.traceId,
          event.sequence,
          event.notebookId,
          event.spanId ?? null,
          event.type,
          event.attempt ?? null,
          event.at,
          JSON.stringify(event.payload),
        ],
      );
      await client.query(
        "UPDATE agent_traces SET last_sequence=GREATEST(last_sequence,$2) WHERE trace_id=$1",
        [event.traceId, event.sequence],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(notebookId: string, limit = 100): Promise<TraceSummary[]> {
    await this.flushSpool();
    let rows: TraceSummary[] = [];
    if (this.pool)
      try {
        const result = await this.pool.query(
          `SELECT trace_id,notebook_id,runner,name,status,created_at,started_at,finished_at,duration_ms,error,metadata
           FROM agent_traces WHERE notebook_id=$1 ORDER BY created_at DESC LIMIT $2`,
          [notebookId, limit],
        );
        rows = result.rows.map((row) => this.summaryFromRow(row));
      } catch {
        this.persistence = "degraded";
      }
    const merged = new Map(rows.map((row) => [row.traceId, row]));
    for (const event of this.readSpool()) {
      if (event.notebookId !== notebookId) continue;
      if (event.type === "trace.started") {
        const summary = rootFromPayload(event);
        if (summary && !merged.has(summary.traceId))
          merged.set(summary.traceId, summary);
      }
      const existing = merged.get(event.traceId);
      if (existing && event.type === "trace.status")
        merged.set(event.traceId, {
          ...existing,
          status: event.payload.status as TraceStatus,
          startedAt: existing.startedAt ?? event.at,
        });
      if (existing && event.type === "trace.finished")
        merged.set(event.traceId, {
          ...existing,
          status: event.payload.status as TraceStatus,
          finishedAt: event.at,
          durationMs: Number(event.payload.durationMs) || undefined,
          error:
            typeof event.payload.error === "string"
              ? event.payload.error
              : undefined,
        });
    }
    return [...merged.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((row) => ({ ...row, persistence: this.persistence }));
  }

  async detail(
    notebookId: string,
    traceId: string,
  ): Promise<TraceDetail | undefined> {
    await this.flushSpool();
    let summary = (await this.list(notebookId, 1000)).find(
      (t) => t.traceId === traceId,
    );
    if (!summary && this.pool)
      try {
        const result = await this.pool.query(
          `SELECT trace_id,notebook_id,runner,name,status,created_at,started_at,finished_at,duration_ms,error,metadata
           FROM agent_traces WHERE notebook_id=$1 AND trace_id=$2`,
          [notebookId, traceId],
        );
        if (result.rows[0]) summary = this.summaryFromRow(result.rows[0]);
      } catch {
        this.persistence = "degraded";
      }
    if (!summary) return;
    let spans: TraceSpan[] = [];
    if (this.pool)
      try {
        const result = await this.pool.query(
          `SELECT span_id,parent_span_id,name,kind,status,started_at,finished_at,duration_ms,attempt,error,attributes
           FROM agent_trace_spans WHERE trace_id=$1 ORDER BY started_at,span_id`,
          [traceId],
        );
        spans = result.rows.map((row) => this.spanFromRow(row));
      } catch {
        this.persistence = "degraded";
      }
    const byId = new Map(spans.map((span) => [span.spanId, span]));
    for (const event of this.readSpool().filter((e) => e.traceId === traceId)) {
      if (event.type === "span.started") {
        const span = event.payload.span as TraceSpan;
        if (!byId.has(span.spanId)) byId.set(span.spanId, span);
      } else if (event.type === "span.finished" && event.spanId) {
        const current = byId.get(event.spanId);
        if (current)
          byId.set(event.spanId, {
            ...current,
            status: event.payload.status as TraceSpan["status"],
            finishedAt: Number(event.payload.finishedAt),
            durationMs: Number(event.payload.durationMs),
            error:
              typeof event.payload.error === "string"
                ? event.payload.error
                : undefined,
            attributes: {
              ...current.attributes,
              ...(event.payload.attributes as Record<string, unknown>),
            },
          });
      }
    }
    return {
      ...summary,
      persistence: this.persistence,
      spans: [...byId.values()].sort((a, b) => a.startedAt - b.startedAt),
    };
  }

  async events(
    notebookId: string,
    traceId: string,
    after = 0,
    limit = 200,
  ): Promise<TraceEventPage> {
    await this.flushSpool();
    let events: TraceEvent[] = [];
    if (this.pool)
      try {
        const result = await this.pool.query(
          `SELECT event_id,trace_id,sequence,notebook_id,span_id,at,event_type,attempt,payload
           FROM agent_trace_events WHERE notebook_id=$1 AND trace_id=$2 AND sequence>$3
           ORDER BY sequence LIMIT $4`,
          [notebookId, traceId, after, limit + 1],
        );
        events = result.rows.map((row) => this.eventFromRow(row));
      } catch {
        this.persistence = "degraded";
      }
    const byId = new Map(events.map((event) => [event.eventId, event]));
    for (const event of this.readSpool())
      if (
        event.notebookId === notebookId &&
        event.traceId === traceId &&
        event.sequence > after
      )
        byId.set(event.eventId, event);
    const sorted = [...byId.values()].sort((a, b) => a.sequence - b.sequence);
    const hasMore = sorted.length > limit;
    const page = sorted.slice(0, limit);
    return {
      events: page,
      nextCursor: page.at(-1)?.sequence ?? after,
      hasMore,
      persistence: this.persistence,
    };
  }

  async dashboard(
    notebookId: string,
    since: number,
    until: number,
  ): Promise<AgentDashboardData> {
    const recent = await this.list(notebookId, 5001);
    const found = recent.filter(
      (t) => t.createdAt >= since && t.createdAt <= until,
    );
    const traces = found.slice(0, 5000);
    const ids = new Set(traces.map((t) => t.traceId));
    const types = [
      "model.request",
      "model.response",
      "tool.call",
      "citation.validation",
    ];
    let rows: TraceEvent[] = [];
    let queryFailed = false;
    if (this.pool && ids.size) {
      try {
        const result = await this.pool.query(
          `SELECT event_id,trace_id,sequence,notebook_id,span_id,at,event_type,attempt,
            jsonb_build_object('model',payload->'model','url',payload->'url',
              'httpStatus',payload->'httpStatus','promptTokens',payload->'promptTokens',
              'completionTokens',payload->'completionTokens','valid',payload->'valid') AS payload
           FROM agent_trace_events WHERE notebook_id=$1 AND trace_id=ANY($2::uuid[])
             AND event_type=ANY($3::text[]) ORDER BY at,event_id LIMIT 100001`,
          [notebookId, [...ids], types],
        );
        rows = result.rows.map((row) => this.eventFromRow(row));
      } catch {
        this.persistence = "degraded";
        queryFailed = true;
      }
    }
    const events = new Map(rows.map((event) => [event.eventId, event]));
    for (const event of this.readSpool()) {
      if (
        event.notebookId === notebookId &&
        ids.has(event.traceId) &&
        types.includes(event.type)
      )
        events.set(event.eventId, event);
    }
    return {
      notebookId,
      since,
      until,
      generatedAt: Date.now(),
      persistence: this.persistence,
      truncated:
        queryFailed ||
        recent.length > 5000 ||
        events.size > 100000 ||
        (!!this.pool && this.persistence === "degraded"),
      traces: dashboardTraces(
        traces,
        [...events.values()].sort((a, b) => a.at - b.at).slice(0, 100000),
      ),
    };
  }

  async metrics(
    notebookId: string,
    since = Date.now() - 30 * 86400000,
  ): Promise<TraceMetrics> {
    const traces = (await this.list(notebookId, 10000)).filter(
      (trace) => trace.createdAt >= since,
    );
    let allEvents: TraceEvent[] = [];
    for (const trace of traces) {
      const page = await this.events(notebookId, trace.traceId, 0, 10000);
      allEvents.push(...page.events);
    }
    const completed = traces.filter((t) => t.status === "completed").length;
    const failed = traces.filter((t) => t.status === "failed").length;
    const interrupted = traces.filter((t) => t.status === "interrupted").length;
    const latencies = traces
      .map((t) => t.durationMs)
      .filter((value): value is number => Number.isFinite(value))
      .sort((a, b) => a - b);
    const percentile = (p: number) =>
      latencies.length
        ? latencies[Math.max(0, Math.ceil(latencies.length * p) - 1)]
        : null;
    const usage = allEvents.filter(
      (e) =>
        e.type === "model.response" &&
        typeof e.payload.httpStatus === "number" &&
        e.payload.httpStatus < 400,
    );
    const reportedTotal = (key: "promptTokens" | "completionTokens") =>
      usage.length &&
      usage.every((event) => typeof event.payload[key] === "number")
        ? usage.reduce((sum, event) => sum + Number(event.payload[key]), 0)
        : null;
    const checks = allEvents.filter((e) => e.type === "citation.validation");
    const passed = checks.filter((e) => e.payload.valid === true).length;
    const failedChecks = checks.filter((e) => e.payload.valid === false).length;
    return {
      since,
      totalRuns: traces.length,
      completedRuns: completed,
      failedRuns: failed,
      interruptedRuns: interrupted,
      completionRate: traces.length ? completed / traces.length : null,
      failureRate: traces.length ? failed / traces.length : null,
      interruptionRate: traces.length ? interrupted / traces.length : null,
      latencyMs: { p50: percentile(0.5), p95: percentile(0.95) },
      modelCalls: allEvents.filter((e) => e.type === "model.request").length,
      toolCalls: allEvents.filter((e) => e.type === "tool.call").length,
      promptTokens: reportedTotal("promptTokens"),
      completionTokens: reportedTotal("completionTokens"),
      citationChecks: checks.length,
      citationChecksPassed: passed,
      citationChecksFailed: failedChecks,
      persistence: this.persistence,
    };
  }

  private async flushSpool() {
    if (!this.pool) return;
    await this.exclusive(async () => {
      try {
        await this.replayLocked();
        this.persistence = "persisted";
      } catch {
        this.persistence = "degraded";
      }
    });
  }

  private summaryFromRow(row: any): TraceSummary {
    return {
      traceId: String(row.trace_id),
      notebookId: String(row.notebook_id),
      runner: row.runner,
      name: String(row.name),
      status: row.status,
      createdAt: Number(row.created_at),
      startedAt: row.started_at == null ? undefined : Number(row.started_at),
      finishedAt: row.finished_at == null ? undefined : Number(row.finished_at),
      durationMs: row.duration_ms == null ? undefined : Number(row.duration_ms),
      error: row.error ?? undefined,
      metadata: row.metadata ?? {},
      persistence: this.persistence,
    };
  }
  private spanFromRow(row: any): TraceSpan {
    return {
      spanId: String(row.span_id),
      parentSpanId: row.parent_span_id ?? undefined,
      name: String(row.name),
      kind: String(row.kind),
      status: row.status,
      startedAt: Number(row.started_at),
      finishedAt: row.finished_at == null ? undefined : Number(row.finished_at),
      durationMs: row.duration_ms == null ? undefined : Number(row.duration_ms),
      attempt: row.attempt == null ? undefined : Number(row.attempt),
      error: row.error ?? undefined,
      attributes: row.attributes ?? {},
    };
  }
  private eventFromRow(row: any): TraceEvent {
    return {
      eventId: String(row.event_id),
      traceId: String(row.trace_id),
      sequence: Number(row.sequence),
      notebookId: String(row.notebook_id),
      spanId: row.span_id ?? undefined,
      at: Number(row.at),
      type: String(row.event_type),
      attempt: row.attempt == null ? undefined : Number(row.attempt),
      payload: row.payload ?? {},
    };
  }
  async close() {
    await this.pool?.end();
  }
}
