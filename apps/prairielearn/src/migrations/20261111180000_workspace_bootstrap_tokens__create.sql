CREATE TABLE workspace_bootstrap_tokens (
  id bigserial PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  workspace_id bigint NOT NULL REFERENCES workspaces ON UPDATE CASCADE ON DELETE CASCADE,
  session_id text NOT NULL,
  authorization_cookies jsonb NOT NULL,
  public_question_endpoint boolean NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX workspace_bootstrap_tokens_expires_at_idx ON workspace_bootstrap_tokens (expires_at);

CREATE INDEX workspace_bootstrap_tokens_workspace_id_idx ON workspace_bootstrap_tokens (workspace_id);
