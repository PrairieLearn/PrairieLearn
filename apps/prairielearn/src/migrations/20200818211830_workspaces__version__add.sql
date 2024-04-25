ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;

ALTER TABLE workspace_logs
ADD COLUMN IF NOT EXISTS workspace_version bigint NOT NULL DEFAULT 1;
