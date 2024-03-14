-- BLOCK select_workspace
SELECT
  w.version,
  c.id AS course_id,
  i.id AS institution_id
FROM
  workspaces AS w
  JOIN variants AS v ON (v.workspace_id = w.id)
  JOIN questions AS q ON (q.id = v.question_id)
  JOIN pl_courses AS c ON (c.id = v.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
WHERE
  w.id = $workspace_id;

-- BLOCK select_and_lock_workspace
SELECT
  *
FROM
  workspaces
WHERE
  id = $workspace_id
FOR NO KEY UPDATE;

-- BLOCK select_workspace_settings
SELECT
  q.*
FROM
  questions AS q
  JOIN variants AS v ON (v.question_id = q.id)
WHERE
  v.workspace_id = $workspace_id;

-- BLOCK update_workspace_hostname
UPDATE workspaces AS w
SET
  hostname = $hostname
WHERE
  w.id = $workspace_id;

-- BLOCK insert_workspace_hosts
INSERT INTO
  workspace_hosts (
    instance_id,
    hostname,
    state,
    state_changed_at,
    ready_at
  )
VALUES
  ($instance_id, $hostname, 'ready', NOW(), NOW())
ON CONFLICT (instance_id) DO
UPDATE
SET
  hostname = EXCLUDED.hostname,
  state = EXCLUDED.state,
  state_changed_at = EXCLUDED.state_changed_at,
  ready_at = EXCLUDED.ready_at;

-- BLOCK update_load_count
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
WHERE
  wh.instance_id = $instance_id;

-- BLOCK get_workspace
SELECT
  w.*
FROM
  workspaces AS w
  JOIN workspace_hosts AS wh ON (wh.id = w.workspace_host_id)
WHERE
  w.id = $workspace_id
  AND wh.instance_id = $instance_id;

-- BLOCK get_running_workspace_id_by_uuid
SELECT
  w.id
FROM
  workspaces AS w
  JOIN workspace_hosts AS wh ON (wh.id = w.workspace_host_id)
WHERE
  w.launch_uuid = $launch_uuid
  AND w.state = 'running'::enum_workspace_state
  AND wh.instance_id = $instance_id;

-- BLOCK set_workspace_launch_uuid
UPDATE workspaces AS w
SET
  launch_uuid = $launch_uuid
FROM
  workspace_hosts AS wh
WHERE
  w.id = $workspace_id
  AND wh.instance_id = $instance_id;

-- BLOCK set_workspace_launch_port
UPDATE workspaces AS w
SET
  launch_port = $launch_port
FROM
  workspace_hosts AS wh
WHERE
  w.id = $workspace_id
  AND wh.instance_id = $instance_id;

-- BLOCK get_is_port_occupied
SELECT
  EXISTS (
    SELECT
      1 AS dummy
    FROM
      workspaces AS w
      JOIN workspace_hosts AS wh ON (wh.id = w.workspace_host_id)
    WHERE
      wh.instance_id = $instance_id
      AND w.launch_port = $port
  ) AS port_used;

-- BLOCK recover_crash_workspaces
-- Similar to the query below, but we don't care if the launch_uuid options are null
SELECT
  w.*
FROM
  workspaces AS w
  JOIN workspace_hosts AS wh ON (w.workspace_host_id = wh.id)
WHERE
  (
    w.state = 'launching'::enum_workspace_state
    OR w.state = 'running'::enum_workspace_state
  )
  AND wh.instance_id = $instance_id;

-- BLOCK get_running_workspaces
SELECT
  w.*
FROM
  workspaces AS w
  JOIN workspace_hosts AS wh ON (w.workspace_host_id = wh.id)
WHERE
  (
    w.state = 'launching'::enum_workspace_state
    OR w.state = 'running'::enum_workspace_state
  )
  AND w.launch_uuid IS NOT NULL
  AND wh.instance_id = $instance_id;

-- BLOCK get_stopped_workspaces
SELECT
  w.*
FROM
  workspaces AS w
  JOIN workspace_hosts AS wh ON (w.workspace_host_id = wh.id)
WHERE
  w.state = 'stopped'::enum_workspace_state
  -- We only want workspaces that have been marked as stopped but still have a
  -- `launch_uuid`, which means it's probably still running on this host.
  AND w.launch_uuid IS NOT NULL
  AND wh.instance_id = $instance_id;

-- BLOCK clear_workspace_on_shutdown
UPDATE workspaces AS w
SET
  launch_uuid = NULL,
  launch_port = NULL,
  workspace_host_id = NULL
FROM
  workspace_hosts AS wh
WHERE
  w.id = $workspace_id
  AND wh.instance_id = $instance_id;

-- BLOCK mark_host_unhealthy
WITH
  updated_workspace_hosts AS (
    UPDATE workspace_hosts AS wh
    SET
      state = 'unhealthy',
      state_changed_at = NOW(),
      unhealthy_at = NOW(),
      unhealthy_reason = $unhealthy_reason
    WHERE
      wh.instance_id = $instance_id
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
