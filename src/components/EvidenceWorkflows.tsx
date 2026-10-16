import { useEffect, useState } from "react";
import "../workflows.css";
import { apiJSON } from "../lib/api";
import { download } from "../lib/storage";
import type { SearchNote } from "../lib/search-notes";
import type { Citation, Source, StudyArtifact } from "../types";
import type {
  ActionProposal,
  EvidenceWorkflow,
  ProposalAction,
  WorkflowReport,
  WorkspaceState,
} from "../workspace-types";

const root = "/api/agent/workspace";
const prompts = {
  study_revision:
    "Prepare a targeted revision plan from my selected notes and recorded quiz mistakes. Connect each focus to the relevant note, mistake and cited book page. Propose editable practice materials and a review session. If no quiz history is shared or recorded, say the learning gaps are unknown.",
  research_synthesis:
    "Compare my selected papers in an evidence table. For each paper, report its finding, method or population, and cited page. Explain where findings support, qualify or conflict with one another; distinguish differences in study settings from direct disagreements. Flag conclusions these sources cannot establish, then propose an editable cited brief and follow-up reading tasks.",
};
export function EvidenceWorkflows({
  notebookId,
  title,
  sources,
  notes,
  onCitation,
  onSave,
}: {
  notebookId: string;
  title: string;
  sources: Source[];
  notes: SearchNote[];
  onCitation: (c: Citation) => void;
  onSave: (a: StudyArtifact) => void;
}) {
  const [state, setState] = useState<WorkspaceState>();
  const [backend, setBackend] = useState("");
  const [workflow, setWorkflow] = useState<EvidenceWorkflow>("study_revision");
  const [prompt, setPrompt] = useState(prompts.study_revision);
  const [sourceIds, setSources] = useState<string[]>([]),
    [noteIds, setNotes] = useState<string[]>([]);
  const [progress, setProgress] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = async () =>
    setState(
      await apiJSON<WorkspaceState>(
        `${root}/${encodeURIComponent(notebookId)}`,
      ),
    );
  useEffect(() => {
    const controller = new AbortController();
    const update = () =>
      void apiJSON<WorkspaceState>(
        `${root}/${encodeURIComponent(notebookId)}`,
        undefined,
        controller.signal,
      )
        .then(setState)
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        });
    update();
    void apiJSON<{ backend: string }>(
      `${root}/status`,
      undefined,
      controller.signal,
    )
      .then((s) => setBackend(s.backend))
      .catch(() => {});
    const timer = setInterval(update, 2500);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [notebookId]);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
  const approvedNotes = notes.filter(
    (n) => !n.references?.some((r) => !sourceIds.includes(r.sourceId)),
  );
  return (
    <section className="evidence-workflows" aria-label="Evidence workflows">
      <div className="agent-section-title">
        <h3>Evidence workflows</h3>
        <span>
          {backend === "postgres"
            ? "PostgreSQL"
            : backend === "json"
              ? "Local workspace"
              : "Connecting…"}
        </span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="workflow-templates">
        {(["study_revision", "research_synthesis"] as const).map((w) => (
          <button
            key={w}
            className={workflow === w ? "primary-button" : "secondary-button"}
            onClick={() => {
              setWorkflow(w);
              setPrompt(prompts[w]);
            }}
          >
            {w === "study_revision" ? "Plan revision" : "Synthesize research"}
          </button>
        ))}
      </div>
      <details className="agent-form" open={!state?.revision}>
        <summary>1 · Approve workspace snapshots</summary>
        <p className="agent-fine">
          Share selected extracted page text and notes with the agent workspace.
          Original files remain in this browser.
        </p>
        <fieldset>
          <legend>Documents</legend>
          {sources.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={sourceIds.includes(s.id)}
                onChange={() => {
                  const ids = toggle(sourceIds, s.id);
                  setSources(ids);
                  setNotes(
                    noteIds.filter(
                      (id) =>
                        !notes
                          .find((n) => n.id === id)
                          ?.references?.some((r) => !ids.includes(r.sourceId)),
                    ),
                  );
                  setConsent(false);
                }}
              />
              {s.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Notes</legend>
          {approvedNotes.length ? (
            approvedNotes.map((n) => (
              <label key={n.id}>
                <input
                  type="checkbox"
                  checked={noteIds.includes(n.id)}
                  onChange={() => {
                    setNotes(toggle(noteIds, n.id));
                    setConsent(false);
                  }}
                />
                {n.title.slice(0, 100)}
              </label>
            ))
          ) : (
            <p>Select documents to include their linked notes.</p>
          )}
        </fieldset>
        <label>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I approve storing these selected snapshots on this server.
        </label>
        <div className="workflow-buttons">
          <button
            className="primary-button"
            disabled={busy || !consent || !sourceIds.length}
            onClick={() =>
              void act(() =>
                apiJSON(`${root}/snapshot`, {
                  notebookId,
                  title,
                  sources: sources
                    .filter((s) => sourceIds.includes(s.id))
                    .map(({ id, name, pages }) => ({ id, name, pages })),
                  notes: approvedNotes
                    .filter((n) => noteIds.includes(n.id))
                    .map((n) => ({
                      ...n,
                      tags: n.tags ?? [],
                      references: n.references ?? [],
                    })),
                  consent: true,
                }),
              )
            }
          >
            {state?.revision
              ? "Refresh approved snapshots"
              : "Approve snapshots"}
          </button>
          {state?.revision && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  apiJSON(`${root}/revoke`, { notebookId, confirm: true }),
                )
              }
            >
              Revoke access
            </button>
          )}
        </div>
      </details>
      {state?.revision && (
        <div className="agent-form">
          <h4>2 · Run with approved evidence</h4>
          <fieldset>
            <legend>Approved documents</legend>
            {state.sources.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={sourceIds.includes(s.id)}
                  onChange={() => setSources(toggle(sourceIds, s.id))}
                />
                {s.name}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Approved notes</legend>
            {state.notes.map((n) => (
              <label key={n.id}>
                <input
                  type="checkbox"
                  checked={noteIds.includes(n.id)}
                  onChange={() => setNotes(toggle(noteIds, n.id))}
                />
                {n.title.slice(0, 100)}
              </label>
            ))}
          </fieldset>
          <label className="field-label">
            Request
            <textarea
              aria-label="Request"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={progress}
              onChange={(e) => setProgress(e.target.checked)}
            />
            Use shared quiz progress ({state.attempts.length} attempts)
          </label>
          <button
            className="primary-button"
            disabled={
              busy ||
              !sourceIds.length ||
              (workflow === "research_synthesis" && sourceIds.length < 2) ||
              (workflow === "study_revision" && !noteIds.length) ||
              !prompt.trim() ||
              state.runs.some(
                (r) => r.status === "queued" || r.status === "running",
              )
            }
            onClick={() =>
              void act(() =>
                apiJSON(`${root}/run`, {
                  notebookId,
                  workflow,
                  prompt,
                  sourceIds,
                  noteIds,
                  includeProgress: progress,
                }),
              )
            }
          >
            Create proposal
          </button>
          {workflow === "research_synthesis" && sourceIds.length < 2 ? (
            <p className="agent-fine" role="status">
              Select at least two sources to compare papers.
            </p>
          ) : workflow === "study_revision" && !noteIds.length ? (
            <p className="agent-fine" role="status">
              Select one or more notes to build a targeted revision plan.
            </p>
          ) : null}
        </div>
      )}
      {state?.runs.map((run) => (
        <article key={run.id} data-run-id={run.id} className="agent-form">
          <h4>
            {run.workflow === "study_revision"
              ? "Revision plan"
              : "Research synthesis"}{" "}
            · {run.status}
          </h4>
          <p>{run.prompt}</p>
          {run.error && <p role="alert">{run.error}</p>}
          <p className="workflow-answer">{run.answer}</p>
          <details>
            <summary>
              Queries, evidence & execution · {run.steps.length} steps
            </summary>
            {run.steps.map((step, i) => (
              <p key={i}>{step.summary}</p>
            ))}
            {run.evidence.map((e) => (
              <details key={e.id}>
                <summary>
                  [{e.id}] {e.kind} · {e.records.length} records · {e.backend}
                </summary>
                <pre>
                  {JSON.stringify(
                    {
                      filters: e.filters,
                      records: e.records,
                      truncated: e.truncated,
                    },
                    null,
                    2,
                  )}
                </pre>
                {e.kind === "progress" &&
                  state.attempts
                    .filter((a) =>
                      e.records.some(
                        (row) =>
                          Array.isArray(row.attemptIds) &&
                          row.attemptIds.includes(a.id),
                      ),
                    )
                    .map((a) => (
                      <details key={a.id}>
                        <summary>
                          {a.title} · {new Date(a.completedAt).toLocaleString()}{" "}
                          · {a.id}
                        </summary>
                        {a.answers.map((q, i) => (
                          <div key={i}>
                            <p>{q.question}</p>
                            <p>
                              Chosen: {q.choices[q.selected]} · Correct:{" "}
                              {q.choices[q.correct]}
                            </p>
                            {q.references.map((r, j) => (
                              <button
                                key={j}
                                className="secondary-button"
                                onClick={() =>
                                  onCitation({
                                    id: 0,
                                    sourceId: r.sourceId,
                                    sourceName:
                                      state.sources.find(
                                        (s) => s.id === r.sourceId,
                                      )?.name ?? r.sourceId,
                                    page: r.page,
                                    text: q.question,
                                  })
                                }
                              >
                                Open page {r.page}
                              </button>
                            ))}
                          </div>
                        ))}
                      </details>
                    ))}
              </details>
            ))}
            {run.citations.map((c) => (
              <button
                key={c.id}
                className="secondary-button"
                title={c.text}
                onClick={() => onCitation(c)}
              >
                [{c.id}] {c.sourceName} · p. {c.page}
              </button>
            ))}
            <p>
              {run.calls} model calls
              {run.usage
                ? ` · ${run.usage.promptTokens + run.usage.completionTokens} tokens`
                : ""}
            </p>
          </details>
          {state.proposals
            .filter((p) => p.runId === run.id)
            .map((p) => (
              <div key={`${p.id}:${p.revision}`}>
                {p.report && (
                  <WorkflowReportView
                    report={p.report}
                    run={run}
                    state={state}
                    onCitation={onCitation}
                  />
                )}
                <ProposalEditor
                  proposal={p}
                  approvedIds={
                    state.receipts.find((r) => r.proposalId === p.id)
                      ?.actionIds ?? []
                  }
                  disabled={busy || run.status !== "completed"}
                  act={act}
                />
              </div>
            ))}
        </article>
      ))}
      {!!state?.materials.length && (
        <div className="agent-form">
          <h4>Approved materials</h4>
          {state.materials.map((m) => (
            <div key={m.id} className="workflow-buttons">
              <span>{m.title}</span>
              <button
                className="secondary-button"
                onClick={() => onSave({ ...m, notebookId })}
              >
                Import into Studio
              </button>
            </div>
          ))}
        </div>
      )}
      {!!state?.plan && (
        <details className="agent-form">
          <summary>Notebook plan</summary>
          <p className="workflow-answer">{state.plan}</p>
        </details>
      )}
      {!!state?.reviews.length && (
        <details className="agent-form">
          <summary>Review & reading tasks</summary>
          {state.reviews.map((r) => (
            <div key={r.id}>
              <p>
                {r.title} · {new Date(r.dueAt).toLocaleString()} · {r.status}
              </p>
              {r.resultRunId && (
                <p>
                  Run: {state.runs.find((v) => v.id === r.resultRunId)?.status}
                </p>
              )}
              {r.status === "pending" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      apiJSON(`${root}/review/complete`, {
                        notebookId,
                        id: r.id,
                      }),
                    )
                  }
                >
                  Mark complete
                </button>
              )}
            </div>
          ))}
        </details>
      )}
      {state?.outbox.map((o) => (
        <div key={o.id} className="agent-form">
          <strong>
            Email · {o.status === "unknown" ? "Check delivery" : o.status}
          </strong>
          <p>
            {o.target.recipient} · {o.title}
          </p>
          {o.error && <p role="alert">{o.error}</p>}
          {o.messageId && (
            <small>SMTP submission accepted · {o.messageId}</small>
          )}
        </div>
      ))}
      {state?.revision && (
        <button
          className="secondary-button"
          onClick={() =>
            download(
              new Blob([JSON.stringify(state, null, 2)], {
                type: "application/json",
              }),
              "agent-workspace.json",
            )
          }
        >
          Export approved workspace
        </button>
      )}
    </section>
  );
}

function WorkflowReportView({
  report,
  run,
  state,
  onCitation,
}: {
  report: WorkflowReport;
  run: WorkspaceState["runs"][number];
  state: WorkspaceState;
  onCitation: (citation: Citation) => void;
}) {
  const citationButton = (id: number, key: string) => {
    const citation = run.citations.find((candidate) => candidate.id === id);
    if (!citation) return null;
    return (
      <button
        key={`${key}:${id}`}
        className="secondary-button workflow-citation"
        title={citation.text}
        onClick={() => onCitation(citation)}
      >
        [{id}] {citation.sourceName} · p. {citation.page}
      </button>
    );
  };
  if (report.kind === "study_revision") {
    const progressLabel =
      report.progressStatus === "not_shared"
        ? "Quiz history was not shared. Learning gaps are unknown."
        : report.progressStatus === "no_recorded_attempts"
          ? "No quiz attempts were recorded. Learning gaps are unknown."
          : "Based on the quiz attempts shared for this notebook.";
    return (
      <section className="workflow-report" aria-label="Study evidence summary">
        <h4>Study focus</h4>
        <p className="workflow-report-status">{progressLabel}</p>
        <div className="workflow-focus-list">
          {report.focusAreas.map((focus, index) => (
            <article className="workflow-focus" key={`${focus.topic}:${index}`}>
              <h5>{focus.topic}</h5>
              <p>{focus.observation}</p>
              <p className="workflow-report-meta">
                Notes:{" "}
                {focus.noteIds
                  .map(
                    (id) =>
                      state.notes.find((note) => note.id === id)?.title ?? id,
                  )
                  .join(", ")}
                {focus.attemptIds.length > 0 && (
                  <>
                    {" "}
                    · Quiz attempts:{" "}
                    {focus.attemptIds
                      .map(
                        (id) =>
                          state.attempts.find((attempt) => attempt.id === id)
                            ?.title ?? id,
                      )
                      .join(", ")}
                  </>
                )}
              </p>
              <div className="workflow-citations">
                {focus.citationIds.map((id) => citationButton(id, focus.topic))}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }
  const relationLabel: Record<
    (typeof report.comparisons)[number]["relation"],
    string
  > = {
    supports: "Supports",
    qualifies: "Qualifies",
    conflicts: "Conflicts",
    insufficient_evidence: "Insufficient evidence",
  };
  return (
    <section className="workflow-report" aria-label="Research evidence report">
      <h4>Evidence by paper</h4>
      <div className="workflow-table-scroll">
        <table className="workflow-evidence-table">
          <thead>
            <tr>
              <th scope="col">Paper</th>
              <th scope="col">Finding</th>
              <th scope="col">Method / population</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {report.papers.map((paper) => (
              <tr key={paper.sourceId}>
                <th scope="row">
                  {state.sources.find((source) => source.id === paper.sourceId)
                    ?.name ?? paper.sourceId}
                </th>
                <td>{paper.finding}</td>
                <td>{paper.methodPopulation}</td>
                <td>
                  <div className="workflow-citations">
                    {paper.citationIds.map((id) =>
                      citationButton(id, paper.sourceId),
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4>Cross-paper comparison</h4>
      <div className="workflow-comparisons">
        {report.comparisons.map((comparison, index) => (
          <article
            className="workflow-focus"
            key={`${comparison.question}:${index}`}
          >
            <div className="workflow-comparison-heading">
              <strong>{comparison.question}</strong>
              <span
                className={`workflow-relation workflow-relation-${comparison.relation}`}
              >
                {relationLabel[comparison.relation]}
              </span>
            </div>
            <p>{comparison.explanation}</p>
            <div className="workflow-citations">
              {comparison.citationIds.map((id) =>
                citationButton(id, `comparison-${index}`),
              )}
            </div>
          </article>
        ))}
      </div>
      {report.unsupportedClaims.length > 0 && (
        <div className="workflow-unsupported">
          <h4>Not established by these papers</h4>
          {report.unsupportedClaims.map((item, index) => (
            <p key={`${item.claim}:${index}`}>
              <strong>{item.claim}</strong> — {item.reason}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function ProposalEditor({
  proposal: p,
  approvedIds,
  disabled,
  act,
}: {
  proposal: ActionProposal;
  approvedIds: string[];
  disabled: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [actions, setActions] = useState(p.actions),
    [selected, setSelected] = useState(p.actions.map((a) => a.id));
  const dirty = JSON.stringify(actions) !== JSON.stringify(p.actions);
  const update = (id: string, patch: Partial<ProposalAction>) =>
    setActions(
      actions.map((a) =>
        a.id === id ? ({ ...a, ...patch } as ProposalAction) : a,
      ),
    );
  const base = { notebookId: p.notebookId, id: p.id, revision: p.revision };
  return (
    <div className="workflow-proposal">
      <h4>
        3 · Review proposal · revision {p.revision} · {p.status}
      </h4>
      {actions.map((a) => (
        <fieldset key={a.id} disabled={disabled || p.status !== "pending"}>
          <legend>
            <label>
              <input
                type="checkbox"
                disabled={disabled || p.status !== "pending"}
                checked={
                  p.status === "approved"
                    ? approvedIds.includes(a.id)
                    : selected.includes(a.id)
                }
                onChange={() =>
                  setSelected(
                    selected.includes(a.id)
                      ? selected.filter((id) => id !== a.id)
                      : [...selected, a.id],
                  )
                }
              />
              {a.kind.replaceAll("_", " ")}
              {p.status === "approved" && (
                <span>
                  {" "}
                  ·{" "}
                  {approvedIds.includes(a.id)
                    ? a.kind === "send_email"
                      ? "Queued for delivery"
                      : "Applied"
                    : "Not approved"}
                </span>
              )}
            </label>
          </legend>
          {"title" in a && (
            <label className="field-label">
              Title
              <input
                value={a.title}
                onChange={(e) => update(a.id, { title: e.target.value })}
              />
            </label>
          )}
          {a.kind === "send_email" && <p>To: {p.emailTarget?.recipient}</p>}
          <label className="field-label">
            {a.kind === "send_email" ? "Exact email preview" : "Content"}
            <textarea
              aria-label={
                a.kind === "send_email" ? "Exact email preview" : "Content"
              }
              rows={5}
              value={
                a.kind === "save_material"
                  ? a.content
                  : a.kind === "schedule_review"
                    ? a.prompt
                    : a.text
              }
              onChange={(e) =>
                update(
                  a.id,
                  a.kind === "save_material"
                    ? { content: e.target.value }
                    : a.kind === "schedule_review"
                      ? { prompt: e.target.value }
                      : { text: e.target.value },
                )
              }
            />
          </label>
          {a.kind === "schedule_review" && (
            <label className="field-label">
              Review time
              <input
                type="datetime-local"
                value={new Date(
                  a.dueAt - new Date(a.dueAt).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)}
                onChange={(e) => {
                  const dueAt = new Date(e.target.value).getTime();
                  if (Number.isFinite(dueAt)) update(a.id, { dueAt });
                }}
              />
            </label>
          )}
          {a.kind === "save_material" && a.items.length > 0 && (
            <details>
              <summary>Edit {a.items.length} practice items</summary>
              {a.items.map((item, i) => {
                const change = (patch: Partial<typeof item>) =>
                  update(a.id, {
                    items: a.items.map((current, index) =>
                      index === i ? { ...current, ...patch } : current,
                    ),
                  });
                return (
                  <fieldset key={i}>
                    <legend>Item {i + 1}</legend>
                    <label className="field-label">
                      Question
                      <input
                        value={item.question}
                        onChange={(e) => change({ question: e.target.value })}
                      />
                    </label>
                    <label className="field-label">
                      Answer
                      <textarea
                        value={item.answer}
                        onChange={(e) => change({ answer: e.target.value })}
                      />
                    </label>
                    {item.choices?.map((choice, j) => (
                      <label key={j} className="field-label">
                        Choice {j + 1}
                        <input
                          value={choice}
                          onChange={(e) =>
                            change({
                              choices: item.choices!.map((c, k) =>
                                k === j ? e.target.value : c,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                    {item.choices && (
                      <label className="field-label">
                        Correct answer
                        <select
                          value={item.correct}
                          onChange={(e) =>
                            change({ correct: Number(e.target.value) })
                          }
                        >
                          {item.choices.map((_, j) => (
                            <option key={j} value={j}>
                              Choice {j + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <small>
                      Sources:{" "}
                      {item.citationIds.map((id) => `[${id}]`).join(" ")}
                    </small>
                  </fieldset>
                );
              })}
            </details>
          )}
          <small>
            Evidence: {a.evidenceIds.map((id) => `[${id}]`).join(" ")}
          </small>
        </fieldset>
      ))}
      {p.status === "pending" && (
        <div className="workflow-buttons">
          <button
            className="secondary-button"
            disabled={disabled || !dirty}
            onClick={() =>
              void act(() =>
                apiJSON(`${root}/proposal/edit`, {
                  ...base,
                  actions: actions.map(({ id, ...action }) => ({ id, action })),
                }),
              )
            }
          >
            Save edits for review
          </button>
          <button
            className="primary-button"
            disabled={disabled || dirty || !selected.length}
            onClick={() =>
              void act(() =>
                apiJSON(`${root}/proposal/approve`, {
                  ...base,
                  actionIds: selected,
                  idempotencyKey: `${p.id}:${p.revision}`,
                  confirm: true,
                }),
              )
            }
          >
            Approve selected actions
          </button>
          <button
            className="secondary-button"
            disabled={disabled}
            onClick={() =>
              void act(() => apiJSON(`${root}/proposal/reject`, base))
            }
          >
            Reject proposal
          </button>
        </div>
      )}
    </div>
  );
}
