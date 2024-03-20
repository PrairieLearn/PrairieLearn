CREATE TYPE enum_log_level AS ENUM('error', 'warn', 'info', 'debug');

CREATE TABLE IF NOT EXISTS workspace_logs (
  id bigserial PRIMARY KEY,
  date timestamptz DEFAULT now(),
  level enum_log_level,
  message text,
  workspace_id bigint NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE ON UPDATE CASCADE
);
