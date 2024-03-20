-- BLOCK set_hosts_unhealthy
WITH
  updated_workspace_hosts AS (
    UPDATE workspace_hosts AS wh
    SET
      state = 'unhealthy',
      unhealthy_at = NOW(),
      unhealthy_reason = $reason
    WHERE
      (
        $workspace_host_id::bigint IS NULL
        OR wh.id = $workspace_host_id
      )
      AND wh.state IN ('launching', 'ready', 'draining')
    RETURNING
      wh.*
  ),
  updated_workspace_host_logs AS (
    INSERT INTO
      workspace_host_logs (workspace_host_id, state, message)
    SELECT
      wh.id,
      wh.state,
      wh.unhealthy_reason
    FROM
      updated_workspace_hosts AS wh
  )
SELECT
  *
FROM
  updated_workspace_hosts;

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
    RETURNING
      w.*
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
    RETURNING
      wh.*
  ),
  workspace_log AS (
    INSERT INTO
      workspace_logs (workspace_id, version, state, message)
    SELECT
      uw.id,
      uw.version,
      uw.state,
      'Assigned to host ' || uwh.id
    FROM
      updated_workspace AS uw,
      updated_workspace_host AS uwh
  ),
  workspace_host_log AS (
    INSERT INTO
      workspace_host_logs (workspace_host_id, state, message)
    SELECT
      uwh.id,
      uwh.state,
      'Assigned workspace ' || uw.id
    FROM
      updated_workspace_host AS uwh,
      updated_workspace AS uw
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
      'Recaptured draining host'
    FROM
      updated_draining_hosts AS wh
  )
SELECT
  count(*)::integer AS recaptured_hosts
FROM
  updated_draining_hosts;

-- BLOCK drain_extra_hosts
WITH
  extra_hosts AS (
    SELECT
      *
    FROM
      workspace_hosts AS wh
    WHERE
      wh.state = 'ready'
    ORDER BY
      wh.launched_at,
      wh.id
    LIMIT
      $surplus
  ),
  updated_workspace_hosts AS (
    UPDATE workspace_hosts AS wh
    SET
      state = 'draining',
      state_changed_at = NOW()
    FROM
      extra_hosts AS e
    WHERE
      wh.id = e.id
    RETURNING
      wh.id,
      wh.state
  )
INSERT INTO
  workspace_host_logs (workspace_host_id, state, message)
SELECT
  wh.id,
  wh.state,
  'Draining extra host'
FROM
  updated_workspace_hosts AS wh;

-- BLOCK find_terminable_hosts
WITH
  -- Find:
  --  draining/unhealthy hosts
  --  unhealthy hosts that have been unhealthy for a while
  --  hosts that have been stuck in launching for a while
  --  hosts in state 'terminating', to make sure they really terminate
  terminable_hosts AS (
    SELECT
      wh.*
    FROM
      workspace_hosts AS wh
    WHERE
      (
        (
          (
            wh.state = 'draining'
            OR wh.state = 'unhealthy'
          )
          AND wh.load_count = 0
        )
        OR (
          wh.state = 'unhealthy'
          AND (now() - wh.unhealthy_at) > make_interval(secs => $unhealthy_timeout_sec)
        )
        OR (
          wh.state = 'launching'
          AND (now() - wh.launched_at) > make_interval(secs => $launch_timeout_sec)
        )
      )
      OR (wh.state = 'terminating')
  ),
  -- Update hosts to be 'terminating'
  -- Set state_changed_at if they weren't already 'terminating'
  updated_workspace_hosts AS (
    UPDATE workspace_hosts AS wh
    SET
      state = 'terminating',
      state_changed_at = NOW()
    FROM
      terminable_hosts AS th
    WHERE
      wh.id = th.id
      AND wh.state != 'terminating'
    RETURNING
      wh.id,
      wh.state
  ),
  logs AS (
    INSERT INTO
      workspace_host_logs (workspace_host_id, state, message)
    SELECT
      wh.id,
      wh.state,
      -- TODO: use more precise message here?
      'Terminating host'
    FROM
      updated_workspace_hosts AS wh
  )
SELECT
  *
FROM
  terminable_hosts;

-- BLOCK terminate_hosts_if_not_launching
WITH
  terminated_workspace_hosts AS (
    UPDATE workspace_hosts AS wh
    SET
      state = 'terminated',
      terminated_at = NOW()
    WHERE
      wh.instance_id IN (
        SELECT
          UNNEST($instance_ids)
      )
      AND wh.state != 'launching'
    RETURNING
      wh.id,
      wh.state
  ),
  logs AS (
    INSERT INTO
      workspace_host_logs (workspace_host_id, state, message)
    SELECT
      wh.id,
      wh.state,
      'Host instance was not found'
    FROM
      terminated_workspace_hosts AS wh
  ),
  terminated_workspaces AS (
    UPDATE workspaces AS w
    SET
      state = 'stopped',
      stopped_at = NOW(),
      state_updated_at = NOW()
    FROM
      terminated_workspace_hosts AS twh
    WHERE
      twh.id = w.workspace_host_id
      AND w.state != 'stopped'
    RETURNING
      w.*
  )
INSERT INTO
  workspace_logs (workspace_id, version, state, message)
SELECT
  tw.id,
  tw.version,
  tw.state,
  'Host instance was not found'
FROM
  terminated_workspaces AS tw
RETURNING
  *;
