import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { AgentConnectionStore } from "../agent-connections.ts";
import {
  snapshotSchema,
  quizAttemptSchema,
  workflowTaskSchema,
  proposeSchema,
  type WorkspaceState,
  type WorkflowRun,
  type ActionProposal,
  type QuizAttempt,
} from "../../src/workspace-types.ts";
import type { WorkspaceRepository } from "./repository.ts";
import { validateActions, validateWorkflowReport } from "./evidence.ts";
import { usesCitation } from "../../src/lib/citations.ts";
import { canonical } from "./canonical.ts";
const orderedRefs = (refs: { sourceId: string; page: number }[]) =>
  [...new Map(refs.map((r) => [JSON.stringify(r), r])).values()].sort((a, b) =>
    a.sourceId < b.sourceId
      ? -1
      : a.sourceId > b.sourceId
        ? 1
        : a.page - b.page,
  );
const comparableAttempt = (a: QuizAttempt) => ({
  ...a,
  answers: a.answers.map((q) => ({
    ...q,
    references: orderedRefs(q.references),
  })),
});

const revisionOf = (s: WorkspaceState) =>
  createHash("sha256")
    .update(
      canonical({
        sources: [...s.sources].sort((a, b) => a.id.localeCompare(b.id)),
        notes: [...s.notes]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((n) => ({ ...n, references: orderedRefs(n.references) })),
        attempts: [...s.attempts]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(comparableAttempt),
      }),
    )
    .digest("hex");

export class WorkspaceConflict extends Error {}
export const scopeId = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((v) => !["__proto__", "constructor", "prototype"].includes(v));
export function assertReferences(
  state: WorkspaceState,
  references: { sourceId: string; page: number }[],
) {
  if (
    references.some(
      (r) =>
        !state.sources
          .find((s) => s.id === r.sourceId)
          ?.pages[r.page - 1]?.trim(),
    )
  )
    throw new WorkspaceConflict(
      "A note or quiz references an unavailable approved source page.",
    );
}
export class WorkspaceService {
  constructor(
    readonly repository: WorkspaceRepository,
    readonly connections: AgentConnectionStore,
  ) {}
  connection() {
    const c = this.connections.runtime();
    return {
      baseUrl: c.baseUrl,
      model: c.model,
      mode: this.connections.value.model.mode,
      configurationRevision: createHash("sha256")
        .update(JSON.stringify(c))
        .digest("hex"),
    };
  }
  checkRun(state: WorkspaceState, run: WorkflowRun) {
    if (!state.revision || state.revision !== run.snapshotRevision)
      throw new WorkspaceConflict(
        "Approved evidence changed. Refresh the workspace and run this task again.",
      );
    if (canonical(run.connection) !== canonical(this.connection()))
      throw new WorkspaceConflict(
        "The model connection changed. Run this task again with the current connection.",
      );
    if (
      this.connections.value.model.mode !== "notebook" &&
      !this.connections.value.model.tested
    )
      throw new WorkspaceConflict(
        "Test the agent connection before running workflows.",
      );
    if (
      run.sourceIds.some((id) => !state.sources.some((s) => s.id === id)) ||
      run.noteIds.some((id) => !state.notes.some((n) => n.id === id))
    )
      throw new WorkspaceConflict(
        "A selected source or note is no longer approved.",
      );
  }
  async snapshot(body: unknown) {
    const input = snapshotSchema.parse(body);
    scopeId.parse(input.notebookId);
    if (
      new Set(input.sources.map((s) => s.id)).size !== input.sources.length ||
      new Set(input.notes.map((n) => n.id)).size !== input.notes.length
    )
      throw new WorkspaceConflict("Duplicate source or note IDs.");
    if (JSON.stringify(input).length > 10000000)
      throw new WorkspaceConflict(
        "Approve a smaller workspace (10 MB maximum).",
      );
    return this.repository.transaction(input.notebookId, (state) => {
      state.sources = input.sources;
      state.notes = input.notes;
      state.title = input.title;
      for (const n of state.notes) assertReferences(state, n.references);
      state.attempts = state.attempts.filter((a) =>
        a.answers.every((q) =>
          q.references.every((r) =>
            state.sources.some(
              (s) => s.id === r.sourceId && s.pages[r.page - 1]?.trim(),
            ),
          ),
        ),
      );
      const revision = revisionOf(state);
      if (revision !== state.revision) {
        for (const p of state.proposals)
          if (p.status === "pending") p.status = "stale";
      }
      state.revision = revision;
      state.approvedAt = Date.now();
      return {
        revision,
        notes: state.notes.length,
        sources: state.sources.length,
      };
    });
  }
  async recordAttempt(body: unknown) {
    const { consent: _, ...input } = quizAttemptSchema.parse(body);
    return this.repository.transaction(scopeId.parse(input.notebookId), (s) => {
      if (!s.revision)
        throw new WorkspaceConflict(
          "Approve this notebook's workspace before sharing a quiz result.",
        );
      if (input.completedAt > Date.now() + 60000)
        throw new WorkspaceConflict(
          "A quiz attempt cannot be dated in the future.",
        );
      for (const a of input.answers) assertReferences(s, a.references);
      const existing = s.attempts.find((a) => a.id === input.id);
      if (
        existing &&
        canonical(comparableAttempt(existing)) !==
          canonical(comparableAttempt(input))
      )
        throw new WorkspaceConflict(
          "A recorded attempt is immutable. Use a new attempt ID.",
        );
      if (!existing) {
        if (s.attempts.length >= 1000)
          throw new WorkspaceConflict(
            "Export and clear old attempts before recording more.",
          );
        s.attempts.push(input);
        for (const p of s.proposals)
          if (p.status === "pending") p.status = "stale";
        s.revision = revisionOf(s);
      }
      return {
        id: input.id,
        score: input.answers.filter((a) => a.selected === a.correct).length,
        total: input.answers.length,
      };
    });
  }
  async queue(body: unknown) {
    const input = workflowTaskSchema.parse(body);
    return this.repository.transaction(scopeId.parse(input.notebookId), (s) => {
      if (!s.revision)
        throw new WorkspaceConflict("Approve the workspace first.");
      if (!input.sourceIds.length)
        throw new WorkspaceConflict("Select at least one approved document.");
      if (input.workflow === "research_synthesis" && input.sourceIds.length < 2)
        throw new WorkspaceConflict(
          "Research synthesis requires at least two selected papers.",
        );
      if (input.workflow === "study_revision" && !input.noteIds.length)
        throw new WorkspaceConflict(
          "Select at least one approved note to build a revision plan.",
        );
      if (
        new Set(input.sourceIds).size !== input.sourceIds.length ||
        new Set(input.noteIds).size !== input.noteIds.length
      )
        throw new WorkspaceConflict("Duplicate evidence selections.");
      for (const note of s.notes.filter((n) => input.noteIds.includes(n.id)))
        if (note.references.some((r) => !input.sourceIds.includes(r.sourceId)))
          throw new WorkspaceConflict(
            "Select the source documents referenced by your selected notes.",
          );
      if (s.runs.some((r) => r.status === "queued" || r.status === "running"))
        throw new WorkspaceConflict(
          "Wait for this notebook's current workflow to finish.",
        );
      const run: WorkflowRun = {
        ...input,
        id: randomUUID(),
        status: "queued",
        snapshotRevision: s.revision,
        connection: this.connection(),
        createdAt: Date.now(),
        answer: "",
        calls: 0,
        steps: [],
        citations: [],
        evidence: [],
      };
      this.checkRun(s, run);
      s.runs.unshift(run);
      return run;
    });
  }
  async createProposal(run: WorkflowRun, body: unknown) {
    const { actions, report } = proposeSchema.parse(body);
    validateWorkflowReport(report, run);
    validateActions(actions, run, Date.now());
    for (const action of actions)
      if (action.kind === "send_email") {
        if (!/\b(e-?mail|mail)\b/i.test(run.prompt))
          throw new WorkspaceConflict(
            "Email must be requested explicitly before proposing delivery.",
          );
        const footer = action.evidenceIds
          .map((id) => {
            const c = run.citations.find((c) => c.id === id);
            const q = run.evidence.find((e) => e.id === id);
            return c
              ? `[${id}] ${c.sourceName}, page ${c.page}`
              : `[${id}] Approved ${q?.kind} query (${q?.records.length ?? 0} records); inspect contributing records in NemoDoc.`;
          })
          .join("\n");
        action.text += `\n\nEvidence\n${footer}`;
        if (action.text.length > 16000)
          throw new WorkspaceConflict(
            "Shorten the email to leave room for its evidence references.",
          );
      }
    return this.repository.transaction(run.notebookId, (s) => {
      this.checkRun(s, run);
      if (s.proposals.some((p) => p.runId === run.id))
        throw new WorkspaceConflict(
          "This run already proposed actions. Finish your answer instead of creating duplicates.",
        );
      const emailTarget = actions.some((a) => a.kind === "send_email")
        ? this.connections.target("email")
        : undefined;
      const proposal: ActionProposal = {
        id: randomUUID(),
        notebookId: run.notebookId,
        runId: run.id,
        revision: 1,
        status: "pending",
        snapshotRevision: s.revision,
        connection: run.connection,
        emailTarget,
        report,
        actions: actions.map((a) => ({ ...a, id: randomUUID() })),
        createdAt: Date.now(),
      };
      s.proposals.unshift(proposal);
      return proposal;
    });
  }
  async edit(body: unknown) {
    const input = z
      .object({
        notebookId: scopeId,
        id: scopeId,
        revision: z.number().int().positive(),
        actions: z
          .array(
            z.object({
              id: scopeId,
              action: proposeSchema.shape.actions.element,
            }),
          )
          .min(1)
          .max(8),
      })
      .strict()
      .parse(body);
    return this.repository.transaction(input.notebookId, (s) => {
      const p = s.proposals.find((p) => p.id === input.id);
      if (!p || p.status !== "pending" || p.revision !== input.revision)
        throw new WorkspaceConflict("Proposal changed. Reload before editing.");
      const run = s.runs.find((r) => r.id === p.runId);
      if (!run) throw new WorkspaceConflict("Run is unavailable.");
      this.checkRun(s, run);
      if (
        new Set(input.actions.map((a) => a.id)).size !== input.actions.length ||
        input.actions.some(
          (a) =>
            !p.actions.some(
              (old) => old.id === a.id && old.kind === a.action.kind,
            ),
        )
      )
        throw new WorkspaceConflict("Edit existing actions only.");
      const actions = input.actions.map((a) => ({ ...a.action, id: a.id }));
      validateActions(actions, run, Date.now());
      if (actions.some((a) => a.kind === "send_email") && !p.emailTarget)
        throw new WorkspaceConflict(
          "Email was not part of the original proposal.",
        );
      p.actions = actions;
      p.revision++;
      return p;
    });
  }
  async approve(body: unknown) {
    const input = z
      .object({
        notebookId: scopeId,
        id: scopeId,
        revision: z.number().int().positive(),
        actionIds: z.array(scopeId).min(1).max(8),
        idempotencyKey: scopeId,
        confirm: z.literal(true),
      })
      .strict()
      .parse(body);
    return this.repository.transaction(input.notebookId, (s) => {
      const existing = s.receipts.find((r) => r.key === input.idempotencyKey);
      if (existing) {
        if (
          existing.proposalId !== input.id ||
          existing.revision !== input.revision ||
          JSON.stringify(existing.actionIds) !== JSON.stringify(input.actionIds)
        )
          throw new WorkspaceConflict(
            "Idempotency key belongs to a different approval.",
          );
        return existing;
      }
      const p = s.proposals.find((p) => p.id === input.id);
      if (!p || p.status !== "pending" || p.revision !== input.revision)
        throw new WorkspaceConflict(
          "Proposal is no longer pending at this revision.",
        );
      const run = s.runs.find((r) => r.id === p.runId);
      if (!run || run.status !== "completed")
        throw new WorkspaceConflict(
          "Only completed workflow proposals can be approved.",
        );
      this.checkRun(s, run);
      const selected = p.actions.filter((a) => input.actionIds.includes(a.id));
      if (selected.length !== input.actionIds.length)
        throw new WorkspaceConflict("Unknown or duplicate action selection.");
      validateActions(selected, run, Date.now());
      for (const a of selected) {
        if (a.kind === "save_material")
          s.materials.push({
            id: a.id,
            title: a.title,
            kind: a.materialKind,
            content: a.content,
            items: a.items,
            citations: structuredClone(
              run.citations.filter(
                (c) =>
                  usesCitation(a.content, c, run.citations) ||
                  a.items.some((i) => i.citationIds.includes(c.id)),
              ),
            ),
            createdAt: Date.now(),
          });
        else if (a.kind === "update_plan") s.plan = a.text;
        else if (a.kind === "schedule_review")
          s.reviews.push({
            id: a.id,
            title: a.title,
            prompt: a.prompt,
            dueAt: a.dueAt,
            status: "pending",
            createdAt: Date.now(),
            proposalId: p.id,
          });
        else {
          const current = this.connections.target("email");
          if (!p.emailTarget || canonical(current) !== canonical(p.emailTarget))
            throw new WorkspaceConflict(
              "Email recipient or connection changed. Create and review a new proposal.",
            );
          s.outbox.push({
            id: a.id,
            proposalId: p.id,
            actionId: a.id,
            target: current,
            title: a.title,
            text: a.text,
            status: "pending",
            createdAt: Date.now(),
          });
        }
      }
      p.status = "approved";
      const receipt = {
        key: input.idempotencyKey,
        proposalId: p.id,
        revision: p.revision,
        actionIds: input.actionIds,
        at: Date.now(),
      };
      s.receipts.push(receipt);
      return receipt;
    });
  }
  async reject(body: unknown) {
    const input = z
      .object({
        notebookId: scopeId,
        id: scopeId,
        revision: z.number().int().positive(),
      })
      .strict()
      .parse(body);
    return this.repository.transaction(input.notebookId, (s) => {
      const p = s.proposals.find((p) => p.id === input.id);
      if (!p || p.status !== "pending" || p.revision !== input.revision)
        throw new WorkspaceConflict(
          "Proposal changed. Reload before rejecting.",
        );
      p.status = "rejected";
      return { ok: true };
    });
  }
  async revoke(notebookId: string) {
    return this.repository.transaction(scopeId.parse(notebookId), (s) => {
      s.sources = [];
      s.notes = [];
      s.attempts = [];
      s.revision = "";
      for (const p of s.proposals)
        if (p.status === "pending") p.status = "stale";
      for (const o of s.outbox)
        if (o.status === "pending") {
          o.status = "failed";
          o.error = "Workspace access revoked before delivery.";
        }
      return { ok: true };
    });
  }
}
