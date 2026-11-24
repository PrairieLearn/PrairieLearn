-- BLOCK set_launch
UPDATE workspaces
SET
  workspace_host_id = $workspace_host_id,
  launch_uuid = $launch_uuid,
  launched_at = now()
WHERE
  id = 1
RETURNING
  *,
  launched_at::text AS launch_started_at;
