ALTER TABLE questions
DROP COLUMN IF EXISTS workspace_sync_ignore;

ALTER TABLE workspaces
DROP COLUMN IF EXISTS homedir_location;
