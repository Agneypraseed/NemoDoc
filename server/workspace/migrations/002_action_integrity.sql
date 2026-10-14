ALTER TABLE workspace_proposals ADD CONSTRAINT workspace_one_proposal_per_run UNIQUE(notebook_id,run_id);
ALTER TABLE workspace_email_outbox ADD CONSTRAINT workspace_outbox_proposal_fk FOREIGN KEY(notebook_id,proposal_id) REFERENCES workspace_proposals(notebook_id,id);
ALTER TABLE workspace_approvals ADD CONSTRAINT workspace_approval_proposal_fk FOREIGN KEY(notebook_id,proposal_id) REFERENCES workspace_proposals(notebook_id,id);
ALTER TABLE workspace_runs ADD CONSTRAINT workspace_run_lifecycle CHECK(status IN ('queued','running','completed','failed','interrupted'));
ALTER TABLE workspace_quiz_answers ADD CONSTRAINT workspace_quiz_choices CHECK(jsonb_typeof(choices)='array' AND jsonb_array_length(choices)>=2 AND selected>=0 AND correct>=0 AND selected<jsonb_array_length(choices) AND correct<jsonb_array_length(choices));
CREATE INDEX workspace_source_lookup_idx ON workspace_pages(notebook_id,source_id);
CREATE INDEX workspace_proposal_status_idx ON workspace_proposals(notebook_id,status);
