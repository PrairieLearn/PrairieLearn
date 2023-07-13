WITH
  updated_workspace_hosts AS (
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
      state_changed_at
  ),
  logs AS (
    INSERT INTO
      workspace_host_logs (workspace_host_id, state, message)
    SELECT
      workspace_host_id,
      state,
      'Manually updated by admin'
    FROM
      updated_workspace_hosts
  )
SELECT
  *
FROM
  updated_workspace_hosts;
