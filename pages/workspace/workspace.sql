-- BLOCK increment_workspace_version
UPDATE workspaces AS w
SET version = version + 1
WHERE w.id = $workspace_id;
