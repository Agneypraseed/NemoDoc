CREATE TABLE agent_traces (
  trace_id uuid PRIMARY KEY,
  notebook_id text NOT NULL,
  runner text NOT NULL CHECK (runner IN ('personal_agent','evidence_workflow')),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','completed','failed','interrupted')),
  created_at bigint NOT NULL,
  started_at bigint,
  finished_at bigint,
  duration_ms bigint,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sequence bigint NOT NULL DEFAULT 0
);
CREATE INDEX agent_traces_notebook_time_idx ON agent_traces(notebook_id,created_at DESC);

CREATE TABLE agent_trace_spans (
  span_id uuid PRIMARY KEY,
  trace_id uuid NOT NULL REFERENCES agent_traces(trace_id) ON DELETE CASCADE,
  parent_span_id uuid,
  name text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','completed','failed','interrupted')),
  started_at bigint NOT NULL,
  finished_at bigint,
  duration_ms bigint,
  attempt integer,
  error text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX agent_trace_spans_trace_time_idx ON agent_trace_spans(trace_id,started_at);

CREATE TABLE agent_trace_events (
  event_id uuid PRIMARY KEY,
  trace_id uuid NOT NULL REFERENCES agent_traces(trace_id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  notebook_id text NOT NULL,
  span_id uuid,
  event_type text NOT NULL,
  attempt integer,
  at bigint NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(trace_id,sequence)
);
CREATE INDEX agent_trace_events_notebook_trace_seq_idx
  ON agent_trace_events(notebook_id,trace_id,sequence);

CREATE FUNCTION reject_agent_trace_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'agent_trace_events is append-only';
END;
$$;
CREATE TRIGGER agent_trace_events_append_only
  BEFORE UPDATE OR DELETE ON agent_trace_events
  FOR EACH ROW EXECUTE FUNCTION reject_agent_trace_event_mutation();

REVOKE ALL ON agent_traces,agent_trace_spans,agent_trace_events FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agent_reader') THEN
    EXECUTE 'REVOKE ALL ON agent_traces,agent_trace_spans,agent_trace_events FROM agent_reader';
  END IF;
END;
$$;
