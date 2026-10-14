import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  emptyWorkspace,
  type WorkspaceState,
  type NotesQuery,
  type WorkspaceNote,
} from "../../src/workspace-types.ts";
import { migrate } from "./migrate.ts";

export interface QueryScope {
  sourceIds: string[];
  noteIds: string[];
}
export interface WorkspaceRepository {
  readonly kind: "json" | "postgres";
  initialize(): Promise<void>;
  ids(): Promise<string[]>;
  read(id: string): Promise<WorkspaceState>;
  transaction<T>(id: string, action: (state: WorkspaceState) => T): Promise<T>;
  queryNotes(
    id: string,
    scope: QueryScope,
    filters: NotesQuery,
  ): Promise<Record<string, unknown>[]>;
  queryProgress(
    id: string,
    scope: QueryScope,
    sourceId?: string,
  ): Promise<Record<string, unknown>[]>;
  queryReviews(
    id: string,
    status: string | undefined,
    now: number,
  ): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}
export const noteRecord = (n: WorkspaceNote) => ({
  id: n.id,
  title: n.title,
  text: n.text,
  kind: n.kind,
  tags: n.tags,
  references: n.references,
  savedAt: n.savedAt ?? null,
});
export class JsonWorkspaceRepository implements WorkspaceRepository {
  readonly kind = "json" as const;
  private states: Record<string, WorkspaceState> = Object.create(null);
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private filename?: string) {}
  async initialize() {
    if (this.filename && existsSync(this.filename)) {
      const saved = JSON.parse(readFileSync(this.filename, "utf8"));
      if (saved.version !== 1 || !Array.isArray(saved.notebooks))
        throw new Error(
          "Preserve the workspace file: unsupported agent workspace format.",
        );
      for (const value of saved.notebooks)
        this.states[value.notebookId] = value;
    }
  }
  async ids() {
    await this.queue;
    return Object.keys(this.states);
  }
  async read(id: string) {
    await this.queue;
    return structuredClone(this.states[id] ?? emptyWorkspace(id));
  }
  transaction<T>(id: string, action: (state: WorkspaceState) => T): Promise<T> {
    const work = this.queue.then(() => {
      const state = structuredClone(this.states[id] ?? emptyWorkspace(id));
      const result = action(state);
      const next = { ...this.states, [id]: state };
      if (this.filename) {
        mkdirSync(path.dirname(this.filename), { recursive: true });
        writeFileSync(
          this.filename + ".tmp",
          JSON.stringify({ version: 1, notebooks: Object.values(next) }),
          { mode: 0o600 },
        );
        renameSync(this.filename + ".tmp", this.filename);
      }
      this.states = next;
      return structuredClone(result);
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
  async queryNotes(id: string, scope: QueryScope, f: NotesQuery) {
    const state = await this.read(id);
    return state.notes
      .filter(
        (n) =>
          scope.noteIds.includes(n.id) &&
          (!n.references.length ||
            n.references.every((r) => scope.sourceIds.includes(r.sourceId))) &&
          (!f.sourceId ||
            n.references.some((r) => r.sourceId === f.sourceId)) &&
          (!f.kind || n.kind === f.kind) &&
          (!f.tag || n.tags.includes(f.tag)) &&
          (f.since === undefined ||
            (n.savedAt !== undefined && n.savedAt >= f.since)) &&
          (f.until === undefined ||
            (n.savedAt !== undefined && n.savedAt <= f.until)),
      )
      .sort(
        (a, b) =>
          (b.savedAt ?? -1) - (a.savedAt ?? -1) || a.id.localeCompare(b.id),
      )
      .slice(0, f.limit + 1)
      .map(noteRecord);
  }
  async queryProgress(id: string, scope: QueryScope, sourceId?: string) {
    const state = await this.read(id),
      result = new Map<string, Record<string, unknown>>();
    for (const attempt of state.attempts)
      for (const answer of attempt.answers)
        for (const ref of answer.references) {
          if (
            !scope.sourceIds.includes(ref.sourceId) ||
            (sourceId && sourceId !== ref.sourceId)
          )
            continue;
          const key = JSON.stringify([
            attempt.artifactId,
            ref.sourceId,
            ref.page,
          ]);
          const row = result.get(key) ?? {
            artifactId: attempt.artifactId,
            title: attempt.title,
            sourceId: ref.sourceId,
            page: ref.page,
            answered: 0,
            mistakes: 0,
            attemptIds: [],
          };
          row.answered = Number(row.answered) + 1;
          row.mistakes =
            Number(row.mistakes) + Number(answer.selected !== answer.correct);
          row.attemptIds = [
            ...new Set([...(row.attemptIds as string[]), attempt.id]),
          ];
          result.set(key, row);
        }
    return [...result.values()]
      .sort(
        (a, b) =>
          Number(b.mistakes) - Number(a.mistakes) ||
          JSON.stringify(a).localeCompare(JSON.stringify(b)),
      )
      .slice(0, 51);
  }
  async queryReviews(id: string, status: string | undefined, now: number) {
    return (await this.read(id)).reviews
      .filter(
        (r) =>
          !status ||
          (status === "overdue"
            ? r.status === "pending" && r.dueAt < now
            : r.status === status),
      )
      .sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id))
      .slice(0, 51)
      .map((r) => ({
        id: r.id,
        title: r.title,
        dueAt: r.dueAt,
        status: r.status,
      }));
  }
  async close() {
    await this.queue;
  }
}

const entityTables = {
  runs: "workspace_runs",
  proposals: "workspace_proposals",
  materials: "workspace_materials",
  reviews: "workspace_reviews",
  outbox: "workspace_email_outbox",
  receipts: "workspace_approvals",
} as const;
export class PostgresWorkspaceRepository implements WorkspaceRepository {
  readonly kind = "postgres" as const;
  readonly pool: Pool;
  private reader: Pool;
  constructor(url: string, readUrl: string) {
    this.pool = new Pool({
      connectionString: url,
      max: 5,
      statement_timeout: 10000,
    });
    this.reader = new Pool({
      connectionString: readUrl,
      max: 3,
      statement_timeout: 5000,
    });
  }
  async initialize() {
    await migrate(this.pool);
    const info = await this.reader.query(
      "SELECT rolsuper,rolname FROM pg_roles WHERE rolname=current_user",
    );
    if (info.rows[0]?.rolsuper)
      throw new Error(
        "Agent SQL connection must use a non-superuser read-only role.",
      );
    const role = '"' + String(info.rows[0].rolname).replaceAll('"', '""') + '"';
    await this.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await this.pool.query(
      `GRANT SELECT ON agent_read_notes,agent_read_progress,agent_read_reviews TO ${role}`,
    );
    for (const table of [
      "workspace_notes",
      "workspace_sources",
      "workspace_pages",
      "workspace_note_refs",
      "workspace_quiz_attempts",
      "workspace_quiz_answers",
      "workspace_answer_refs",
      "workspace_runs",
      "workspace_run_steps",
      "workspace_notebooks",
      "workspace_proposals",
      "workspace_materials",
      "workspace_reviews",
      "workspace_email_outbox",
      "workspace_approvals",
    ]) {
      const access = await this.reader.query(
        "SELECT has_table_privilege(current_user,$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS writable",
        [table],
      );
      if (access.rows[0]?.writable)
        throw new Error(
          "Agent SQL connection must not have table write permissions.",
        );
    }
    await this.reader.query("SELECT * FROM agent_read_notes LIMIT 0");
    await this.reader.query("SELECT * FROM agent_read_progress LIMIT 0");
    await this.reader.query("SELECT * FROM agent_read_reviews LIMIT 0");
  }
  async ids() {
    return (
      await this.pool.query("SELECT id FROM workspace_notebooks ORDER BY id")
    ).rows.map((r) => String(r.id));
  }
  private async load(client: PoolClient, id: string) {
    const state = emptyWorkspace(id),
      book = (
        await client.query("SELECT * FROM workspace_notebooks WHERE id=$1", [
          id,
        ])
      ).rows[0];
    if (!book) return state;
    Object.assign(state, {
      title: book.title,
      revision: book.revision,
      approvedAt: Number(book.approved_at),
      plan: book.plan,
    });
    const sources = (
      await client.query(
        "SELECT id,name FROM workspace_sources WHERE notebook_id=$1 ORDER BY id",
        [id],
      )
    ).rows;
    const pages = (
      await client.query(
        "SELECT source_id,page,body FROM workspace_pages WHERE notebook_id=$1 ORDER BY page",
        [id],
      )
    ).rows;
    state.sources = sources.map((s) => ({
      id: s.id,
      name: s.name,
      pages: pages.filter((p) => p.source_id === s.id).map((p) => p.body),
    }));
    const notes = (
      await client.query(
        "SELECT * FROM workspace_notes WHERE notebook_id=$1 ORDER BY id",
        [id],
      )
    ).rows;
    const references = (
      await client.query(
        "SELECT note_id,source_id,page FROM workspace_note_refs WHERE notebook_id=$1 ORDER BY source_id,page",
        [id],
      )
    ).rows;
    state.notes = notes.map((n) => ({
      id: n.id,
      title: n.title,
      text: n.body,
      kind: n.kind,
      tags: n.tags,
      references: references
        .filter((r) => r.note_id === n.id)
        .map((r) => ({ sourceId: r.source_id, page: r.page })),
      ...(n.saved_at === null ? {} : { savedAt: Number(n.saved_at) }),
      ...(n.updated_at === null ? {} : { updatedAt: Number(n.updated_at) }),
    }));
    const attempts = (
      await client.query(
        "SELECT * FROM workspace_quiz_attempts WHERE notebook_id=$1 ORDER BY id",
        [id],
      )
    ).rows;
    const answers = (
      await client.query(
        "SELECT * FROM workspace_quiz_answers WHERE notebook_id=$1 ORDER BY ordinal",
        [id],
      )
    ).rows;
    const answerRefs = (
      await client.query(
        "SELECT * FROM workspace_answer_refs WHERE notebook_id=$1 ORDER BY source_id,page",
        [id],
      )
    ).rows;
    state.attempts = attempts.map((a) => ({
      id: a.id,
      artifactId: a.artifact_id,
      notebookId: id,
      title: a.title,
      completedAt: Number(a.completed_at),
      answers: answers
        .filter((q) => q.attempt_id === a.id)
        .map((q) => ({
          question: q.question,
          choices: q.choices,
          selected: q.selected,
          correct: q.correct,
          references: answerRefs
            .filter((r) => r.attempt_id === a.id && r.ordinal === q.ordinal)
            .map((r) => ({ sourceId: r.source_id, page: r.page })),
        })),
    }));
    for (const [key, table] of Object.entries(entityTables))
      (state as any)[key] = (
        await client.query(
          `SELECT payload FROM ${table} WHERE notebook_id=$1 ORDER BY id`,
          [id],
        )
      ).rows.map((r) => r.payload);
    state.runs.sort(
      (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id),
    );
    return state;
  }
  async read(id: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const state = await this.load(c, id);
      await c.query("COMMIT");
      return state;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  private async persist(
    c: PoolClient,
    s: WorkspaceState,
    previous: WorkspaceState,
  ) {
    const n = s.notebookId;
    await c.query(
      "INSERT INTO workspace_notebooks(id,title,revision,approved_at,plan) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET title=excluded.title,revision=excluded.revision,approved_at=excluded.approved_at,plan=excluded.plan",
      [n, s.title, s.revision, s.approvedAt, s.plan],
    );
    // One notebook transaction owns its snapshot and dependent records. Agent queries see only committed versions.
    const snapshotChanged =
      JSON.stringify([s.sources, s.notes, s.attempts]) !==
      JSON.stringify([previous.sources, previous.notes, previous.attempts]);
    if (snapshotChanged) {
      await c.query("DELETE FROM workspace_sources WHERE notebook_id=$1", [n]);
      await c.query("DELETE FROM workspace_notes WHERE notebook_id=$1", [n]);
      await c.query(
        "DELETE FROM workspace_quiz_attempts WHERE notebook_id=$1",
        [n],
      );
      for (const source of s.sources) {
        await c.query("INSERT INTO workspace_sources VALUES($1,$2,$3)", [
          n,
          source.id,
          source.name,
        ]);
        await c.query(
          "INSERT INTO workspace_pages(notebook_id,source_id,page,body) SELECT $1,$2,ordinality::integer,body FROM unnest($3::text[]) WITH ORDINALITY AS p(body,ordinality)",
          [n, source.id, source.pages],
        );
      }
      for (const note of s.notes) {
        await c.query(
          "INSERT INTO workspace_notes VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            n,
            note.id,
            note.title,
            note.text,
            note.kind,
            note.tags,
            note.savedAt ?? null,
            note.updatedAt ?? null,
          ],
        );
        for (const r of note.references)
          await c.query(
            "INSERT INTO workspace_note_refs VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [n, note.id, r.sourceId, r.page],
          );
      }
      for (const a of s.attempts) {
        await c.query(
          "INSERT INTO workspace_quiz_attempts VALUES($1,$2,$3,$4,$5)",
          [n, a.id, a.artifactId, a.title, a.completedAt],
        );
        for (const [i, q] of a.answers.entries()) {
          await c.query(
            "INSERT INTO workspace_quiz_answers VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              n,
              a.id,
              i,
              q.question,
              JSON.stringify(q.choices),
              q.selected,
              q.correct,
            ],
          );
          for (const r of q.references)
            await c.query(
              "INSERT INTO workspace_answer_refs VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
              [n, a.id, i, r.sourceId, r.page],
            );
        }
      }
    }
    // Update only changed lifecycle records. Snapshot text is not rewritten for each model step.
    for (const [key, table] of Object.entries(entityTables)) {
      const retained = (s as any)[key].map((v: any) =>
        key === "receipts" ? v.key : v.id,
      );
      await c.query(
        `DELETE FROM ${table} WHERE notebook_id=$1 AND NOT(id=ANY($2::text[]))`,
        [n, retained],
      );
      for (const value of (s as any)[key]) {
        const data = JSON.stringify(value);
        const old = (previous as any)[key].find((v: any) =>
          key === "receipts" ? v.key === value.key : v.id === value.id,
        );
        if (old && JSON.stringify(old) === data) continue;
        if (key === "runs") {
          await c.query(
            `INSERT INTO ${table} VALUES($1,$2,$3,$4,$5) ON CONFLICT(notebook_id,id) DO UPDATE SET status=excluded.status,payload=excluded.payload`,
            [n, value.id, value.status, value.createdAt, data],
          );
          await c.query(
            "DELETE FROM workspace_run_steps WHERE notebook_id=$1 AND run_id=$2",
            [n, value.id],
          );
          for (const [i, step] of value.steps.entries())
            await c.query(
              "INSERT INTO workspace_run_steps VALUES($1,$2,$3,$4,$5,$6)",
              [n, value.id, i, step.tool, step.summary, step.at],
            );
        } else if (key === "proposals")
          await c.query(
            `INSERT INTO ${table} VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(notebook_id,id) DO UPDATE SET revision=excluded.revision,status=excluded.status,payload=excluded.payload`,
            [n, value.id, value.runId, value.revision, value.status, data],
          );
        else if (key === "reviews")
          await c.query(
            `INSERT INTO ${table} VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(notebook_id,id) DO UPDATE SET title=excluded.title,due_at=excluded.due_at,status=excluded.status,payload=excluded.payload`,
            [n, value.id, value.title, value.dueAt, value.status, data],
          );
        else if (key === "outbox")
          await c.query(
            `INSERT INTO ${table} VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(notebook_id,id) DO UPDATE SET status=excluded.status,payload=excluded.payload`,
            [n, value.id, value.proposalId, value.actionId, value.status, data],
          );
        else if (key === "receipts")
          await c.query(
            `INSERT INTO ${table} VALUES($1,$2,$3,$4) ON CONFLICT(notebook_id,id) DO NOTHING`,
            [n, value.key, value.proposalId, data],
          );
        else
          await c.query(
            `INSERT INTO ${table} VALUES($1,$2,$3) ON CONFLICT(notebook_id,id) DO UPDATE SET payload=excluded.payload`,
            [n, value.id, data],
          );
      }
    }
  }
  async transaction<T>(id: string, action: (s: WorkspaceState) => T) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        id,
      ]);
      const s = await this.load(c, id);
      const previous = structuredClone(s);
      const result = action(s);
      await this.persist(c, s, previous);
      await c.query("COMMIT");
      return structuredClone(result);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async queryNotes(id: string, scope: QueryScope, f: NotesQuery) {
    const rows = (
      await this.reader.query(
        `SELECT n.id,n.title,n.body AS text,n.kind,n.tags,n.saved_at AS "savedAt",
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object('sourceId',n.source_id,'page',n.page)) FILTER(WHERE n.source_id IS NOT NULL),'[]') AS "references"
      FROM agent_read_notes n WHERE n.notebook_id=$1 AND n.id=ANY($2::text[])
      AND NOT EXISTS(SELECT 1 FROM agent_read_notes denied WHERE denied.notebook_id=n.notebook_id AND denied.id=n.id AND denied.source_id IS NOT NULL AND NOT(denied.source_id=ANY($3::text[])))
      AND ($4::text IS NULL OR EXISTS(SELECT 1 FROM agent_read_notes r WHERE r.notebook_id=n.notebook_id AND r.id=n.id AND r.source_id=$4))
      AND ($5::text IS NULL OR n.kind=$5) AND ($6::text IS NULL OR $6=ANY(n.tags))
      AND ($7::bigint IS NULL OR n.saved_at >= $7) AND ($8::bigint IS NULL OR n.saved_at <= $8)
      GROUP BY n.id,n.title,n.body,n.kind,n.tags,n.saved_at ORDER BY n.saved_at DESC NULLS LAST,n.id LIMIT $9`,
        [
          id,
          scope.noteIds,
          scope.sourceIds,
          f.sourceId ?? null,
          f.kind ?? null,
          f.tag ?? null,
          f.since ?? null,
          f.until ?? null,
          f.limit + 1,
        ],
      )
    ).rows;
    return rows.map((r) => ({
      ...r,
      savedAt: r.savedAt === null ? null : Number(r.savedAt),
    }));
  }
  async queryProgress(id: string, scope: QueryScope, sourceId?: string) {
    return (
      await this.reader.query(
        `SELECT artifact_id AS "artifactId",title,source_id AS "sourceId",page,
      count(*)::integer AS answered,count(*) FILTER(WHERE selected<>correct)::integer AS mistakes,
      array_agg(DISTINCT attempt_id ORDER BY attempt_id) AS "attemptIds"
      FROM agent_read_progress WHERE notebook_id=$1 AND source_id=ANY($2::text[]) AND ($3::text IS NULL OR source_id=$3)
      GROUP BY artifact_id,title,source_id,page ORDER BY mistakes DESC,artifact_id,source_id,page LIMIT 51`,
        [id, scope.sourceIds, sourceId ?? null],
      )
    ).rows;
  }
  async queryReviews(id: string, status: string | undefined, now: number) {
    return (
      await this.reader.query(
        `SELECT id,title,due_at AS "dueAt",status FROM agent_read_reviews WHERE notebook_id=$1
      AND ($2::text IS NULL OR ($2='overdue' AND status='pending' AND due_at<$3) OR status=$2)
      ORDER BY due_at,id LIMIT 51`,
        [id, status ?? null, now],
      )
    ).rows.map((r) => ({ ...r, dueAt: Number(r.dueAt) }));
  }
  async close() {
    await Promise.all([this.pool.end(), this.reader.end()]);
  }
}
