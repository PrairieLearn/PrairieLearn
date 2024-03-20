ALTER TABLE workspaces
DROP COLUMN port;

ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS hostname text;
