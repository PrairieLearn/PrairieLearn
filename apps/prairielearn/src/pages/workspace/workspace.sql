-- BLOCK increment_workspace_version
UPDATE workspaces AS w
SET
  version = version + 1,
  reset_at = now()
WHERE
  w.id = $workspace_id;

-- BLOCK update_workspace_rebooted_at_now
UPDATE workspaces AS w
SET
  rebooted_at = now()
WHERE
  w.id = $workspace_id;
