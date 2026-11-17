-- BLOCK increment_workspace_version
UPDATE workspaces AS w
SET
  version = version + 1,
  reset_at = now()
WHERE
  w.id = $workspace_id;

-- BLOCK reboot_workspace
UPDATE workspaces AS w
SET
  rebooted_at = now(),
  -- Pending launches must stop writing state as soon as a reboot is requested.
  launch_uuid = NULL,
  launch_port = NULL,
  workspace_host_id = NULL
WHERE
  w.id = $workspace_id;
