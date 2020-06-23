CREATE TABLE IF NOT EXISTS workspace_logs (
    id bigserial PRIMARY KEY,
    date timestamptz DEFAULT now(),
    level smallint,
    message text,
    workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE
);
