WITH
  updated_workspace_hosts AS (
    UPDATE workspace_hosts AS wh
    SET
      state = 'unhealthy',
      state_changed_at = NOW(),
      unhealthy_at = NOW(),
      unhealthy_reason = $unhealthy_reason
    WHERE
      wh.state IN ('launching', 'ready', 'draining')
    RETURNING
      wh.id AS workspace_host_id,
      wh.instance_id,
      wh.state,
      wh.unhealthy_at,
      wh.unhealthy_reason
  ),
  logs AS (
    INSERT INTO
      workspace_host_logs (workspace_host_id, state, message)
    SELECT
      workspace_host_id,
      state,
      unhealthy_reason
    FROM
      updated_workspace_hosts
  )
SELECT
  *
FROM
  updated_workspace_hosts;
