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

-- BLOCK recapture_draining_hosts
WITH
  -- Find ids of at most `needed_hosts` hosts that are currently draining
  found_draining_hosts AS (
    SELECT
      *
    FROM
      workspace_hosts AS wh
    WHERE
      wh.state = 'draining'
    ORDER BY
      launched_at DESC
    LIMIT
      $needed_hosts
  ),
  -- Update found hosts to be ready if still draining
  updated_draining_hosts AS (
    UPDATE workspace_hosts AS wh
    SET
      state = 'ready',
      state_changed_at = NOW()
    FROM
      found_draining_hosts AS fdh
    WHERE
      wh.id = fdh.id
      AND wh.state = 'draining'
    RETURNING
      wh.*
  ),
  logs AS (
    INSERT INTO
      workspace_host_logs (workspace_host_id, state, message)
    SELECT
      wh.id,
      wh.state,
      'Recaptured host'
    FROM
      updated_draining_hosts AS wh
  )
SELECT
  count(*) AS recaptured_hosts
FROM
  updated_draining_hosts;
