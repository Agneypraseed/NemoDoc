CREATE TABLE workspace_notebooks (
  id text PRIMARY KEY, title text NOT NULL, revision text NOT NULL,
  approved_at bigint NOT NULL, plan text NOT NULL DEFAULT ''
);
CREATE TABLE workspace_sources (
  notebook_id text NOT NULL REFERENCES workspace_notebooks(id) ON DELETE CASCADE,
  id text NOT NULL, name text NOT NULL, PRIMARY KEY(notebook_id,id)
);
CREATE TABLE workspace_pages (
  notebook_id text NOT NULL, source_id text NOT NULL, page integer NOT NULL CHECK(page > 0), body text NOT NULL,
  PRIMARY KEY(notebook_id,source_id,page),
  FOREIGN KEY(notebook_id,source_id) REFERENCES workspace_sources(notebook_id,id) ON DELETE CASCADE
);
CREATE TABLE workspace_notes (
  notebook_id text NOT NULL REFERENCES workspace_notebooks(id) ON DELETE CASCADE,
  id text NOT NULL, title text NOT NULL, body text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('answer','passage','highlight','notebook')),
  tags text[] NOT NULL DEFAULT '{}', saved_at bigint, updated_at bigint,
  PRIMARY KEY(notebook_id,id)
);
CREATE TABLE workspace_note_refs (
  notebook_id text NOT NULL, note_id text NOT NULL, source_id text NOT NULL, page integer NOT NULL,
  PRIMARY KEY(notebook_id,note_id,source_id,page),
  FOREIGN KEY(notebook_id,note_id) REFERENCES workspace_notes(notebook_id,id) ON DELETE CASCADE,
  FOREIGN KEY(notebook_id,source_id,page) REFERENCES workspace_pages(notebook_id,source_id,page) ON DELETE CASCADE
);
CREATE TABLE workspace_quiz_attempts (
  notebook_id text NOT NULL REFERENCES workspace_notebooks(id) ON DELETE CASCADE,
  id text NOT NULL, artifact_id text NOT NULL, title text NOT NULL, completed_at bigint NOT NULL,
  PRIMARY KEY(notebook_id,id)
);
CREATE TABLE workspace_quiz_answers (
  notebook_id text NOT NULL, attempt_id text NOT NULL, ordinal integer NOT NULL,
  question text NOT NULL, choices jsonb NOT NULL, selected integer NOT NULL, correct integer NOT NULL,
  PRIMARY KEY(notebook_id,attempt_id,ordinal),
  FOREIGN KEY(notebook_id,attempt_id) REFERENCES workspace_quiz_attempts(notebook_id,id) ON DELETE CASCADE
);
CREATE TABLE workspace_answer_refs (
  notebook_id text NOT NULL, attempt_id text NOT NULL, ordinal integer NOT NULL, source_id text NOT NULL, page integer NOT NULL,
  PRIMARY KEY(notebook_id,attempt_id,ordinal,source_id,page),
  FOREIGN KEY(notebook_id,attempt_id,ordinal) REFERENCES workspace_quiz_answers(notebook_id,attempt_id,ordinal) ON DELETE CASCADE,
  FOREIGN KEY(notebook_id,source_id,page) REFERENCES workspace_pages(notebook_id,source_id,page) ON DELETE CASCADE
);
CREATE TABLE workspace_runs (
  notebook_id text NOT NULL REFERENCES workspace_notebooks(id) ON DELETE CASCADE,
  id text NOT NULL, status text NOT NULL, created_at bigint NOT NULL, payload jsonb NOT NULL,
  PRIMARY KEY(notebook_id,id)
);
CREATE TABLE workspace_run_steps (
  notebook_id text NOT NULL, run_id text NOT NULL, ordinal integer NOT NULL,
  tool text NOT NULL, summary text NOT NULL, at bigint NOT NULL,
  PRIMARY KEY(notebook_id,run_id,ordinal),
  FOREIGN KEY(notebook_id,run_id) REFERENCES workspace_runs(notebook_id,id) ON DELETE CASCADE
);
CREATE TABLE workspace_proposals (
  notebook_id text NOT NULL, id text NOT NULL, run_id text NOT NULL, revision integer NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','approved','rejected','stale')), payload jsonb NOT NULL,
  PRIMARY KEY(notebook_id,id),
  FOREIGN KEY(notebook_id,run_id) REFERENCES workspace_runs(notebook_id,id) ON DELETE CASCADE
);
CREATE TABLE workspace_materials (
  notebook_id text NOT NULL REFERENCES workspace_notebooks(id) ON DELETE CASCADE,
  id text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(notebook_id,id)
);
CREATE TABLE workspace_reviews (
  notebook_id text NOT NULL REFERENCES workspace_notebooks(id) ON DELETE CASCADE,
  id text NOT NULL, title text NOT NULL, due_at bigint NOT NULL, status text NOT NULL CHECK(status IN ('pending','completed')),
  payload jsonb NOT NULL, PRIMARY KEY(notebook_id,id)
);
CREATE TABLE workspace_email_outbox (
  notebook_id text NOT NULL REFERENCES workspace_notebooks(id) ON DELETE CASCADE,
  id text NOT NULL, proposal_id text NOT NULL, action_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','sending','accepted','failed','unknown')), payload jsonb NOT NULL,
  PRIMARY KEY(notebook_id,id), UNIQUE(notebook_id,proposal_id,action_id)
);
CREATE TABLE workspace_approvals (
  notebook_id text NOT NULL REFERENCES workspace_notebooks(id) ON DELETE CASCADE,
  id text NOT NULL, proposal_id text NOT NULL, payload jsonb NOT NULL,
  PRIMARY KEY(notebook_id,id), UNIQUE(notebook_id,proposal_id)
);
CREATE INDEX workspace_notes_date_idx ON workspace_notes(notebook_id,saved_at);
CREATE INDEX workspace_note_source_idx ON workspace_note_refs(notebook_id,source_id,page);
CREATE INDEX workspace_attempt_date_idx ON workspace_quiz_attempts(notebook_id,completed_at);
CREATE INDEX workspace_review_due_idx ON workspace_reviews(status,due_at);
CREATE INDEX workspace_run_status_idx ON workspace_runs(status,created_at);
CREATE INDEX workspace_outbox_status_idx ON workspace_email_outbox(status);
CREATE VIEW agent_read_notes AS SELECT n.*,r.source_id,r.page FROM workspace_notes n LEFT JOIN workspace_note_refs r ON r.notebook_id=n.notebook_id AND r.note_id=n.id;
CREATE VIEW agent_read_progress AS
 SELECT a.notebook_id,a.id AS attempt_id,a.artifact_id,a.title,a.completed_at,q.ordinal,q.question,q.selected,q.correct,r.source_id,r.page
 FROM workspace_quiz_attempts a JOIN workspace_quiz_answers q ON q.notebook_id=a.notebook_id AND q.attempt_id=a.id
 JOIN workspace_answer_refs r ON r.notebook_id=q.notebook_id AND r.attempt_id=q.attempt_id AND r.ordinal=q.ordinal;
CREATE VIEW agent_read_reviews AS SELECT notebook_id,id,title,due_at,status FROM workspace_reviews;
