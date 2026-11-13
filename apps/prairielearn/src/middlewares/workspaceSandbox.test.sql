-- BLOCK insert_workspace
INSERT INTO
  workspaces
DEFAULT VALUES
RETURNING
  id;

-- BLOCK expire_bootstrap_tokens
UPDATE workspace_bootstrap_tokens
SET
  expires_at = now() - interval '1 minute';
