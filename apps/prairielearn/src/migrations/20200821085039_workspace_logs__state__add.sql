ALTER TABLE workspace_logs
DROP COLUMN level;

ALTER TABLE workspace_logs
ADD COLUMN state enum_workspace_state NULL;

ALTER TABLE workspace_logs
RENAME COLUMN workspace_version to version;
