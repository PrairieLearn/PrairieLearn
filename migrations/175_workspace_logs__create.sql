CREATE TYPE enum_workspace_log_log_level AS ENUM ('debug', 'error', 'info', 'warn');

CREATE TABLE IF NOT EXISTS workspace_logs (
    id bigserial PRIMARY KEY,
    date timestamptz DEFAULT now(),
    log_level enum_workspace_log_log_level,
    message text,
    workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE
);
