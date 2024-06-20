CREATE TABLE IF NOT EXISTS workspace_host_logs (
  id bigserial PRIMARY KEY,
  date timestamptz NOT NULL DEFAULT now(),
  message text,
  state enum_workspace_host_state,
  workspace_host_id bigint NOT NULL REFERENCES workspace_hosts (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS workspace_host_logs_workspace_host_id_idx ON workspace_host_logs (workspace_host_id);
