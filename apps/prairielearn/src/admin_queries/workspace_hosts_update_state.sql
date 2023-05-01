UPDATE workspace_hosts
SET
  state = $state,
  state_changed_at = now(),
  terminated_at = CASE
    WHEN $state::enum_workspace_host_state = 'terminated' THEN now()
    ELSE terminated_at
  END,
  unhealthy_at = CASE
    WHEN $state::enum_workspace_host_state = 'unhealthy' THEN now()
    ELSE unhealthy_at
  END
WHERE
  id = $workspace_host_id
RETURNING
  id AS workspace_host_id,
  instance_id,
  state,
  state_changed_at;
