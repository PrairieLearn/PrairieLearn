-- BLOCK set_host_unhealthy
WITH
  updated_workspace_hosts AS (
    UPDATE workspace_hosts AS wh
    SET
      state = 'unhealthy',
      unhealthy_at = NOW(),
      unhealthy_reason = $reason
    WHERE
      wh.id = $workspace_host_id
      AND wh.state IN ('launching', 'ready', 'draining')
    RETURNING
      wh.id,
      wh.state,
      wh.unhealthy_reason
  )
INSERT INTO
  workspace_host_logs (workspace_host_id, state, message)
SELECT
  wh.id,
  wh.state,
  wh.unhealthy_reason
FROM
  updated_workspace_hosts AS wh;

-- BLOCK assign_workspace_to_host
WITH
  available_host AS (
    SELECT
      id
    FROM
      workspace_hosts AS wh
    WHERE
      wh.state = 'ready'
      AND wh.load_count < $capacity
    ORDER BY
      random()
    LIMIT
      1
  ),
  updated_workspace AS (
    UPDATE workspaces AS w
    SET
      workspace_host_id = ah.id
    FROM
      available_host AS ah
    WHERE
      w.id = $workspace_id
  ),
  updated_workspace_host AS (
    UPDATE workspace_hosts as wh
    SET
      load_count = (
        SELECT
          count(*)
        FROM
          workspaces AS w
        WHERE
          w.workspace_host_id = wh.id
          AND (
            w.state = 'running'
            OR w.state = 'launching'
          )
      )
    FROM
      available_host AS ah
    WHERE
      wh.id = ah.id
  )
SELECT
  id AS workspace_host_id
FROM
  available_host;
