-- BLOCK select_workspace_settings
SELECT
  q.*,
  -- If `url_rewrite` has already been retrieved in a previous container launch,
  -- use that value. Otherwise, use the value from the `questions` table. The
  -- value may still be null, in which case the container creation process
  -- retrieves the settings from the image labels or defaults to true.
  COALESCE(w.url_rewrite, q.workspace_url_rewrite) AS workspace_url_rewrite
FROM
  workspaces AS w
  JOIN variants AS v ON (v.workspace_id = w.id)
  JOIN questions AS q ON (q.id = v.question_id)
WHERE
  w.id = $workspace_id;

-- BLOCK update_workspace_url_rewrite
UPDATE workspaces AS w
SET
  url_rewrite = $url_rewrite
WHERE
  w.id = $id
  AND w.state = 'launching'
  AND w.launch_uuid = $launch_uuid;

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
ON CONFLICT (instance_id) DO UPDATE
SET
  hostname = EXCLUDED.hostname,
  state = EXCLUDED.state,
  state_changed_at = EXCLUDED.state_changed_at,
  ready_at = EXCLUDED.ready_at;

-- BLOCK lock_workspace_host_for_load_count_update
SELECT
  id
FROM
  workspace_hosts
WHERE
  instance_id = $instance_id
FOR NO KEY UPDATE;

-- BLOCK update_load_count
UPDATE workspace_hosts AS wh
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

-- BLOCK claim_workspace_launch
UPDATE workspaces AS w
SET
  -- Main servers that predate launch identities don't send one, so the host
  -- has to mint it. This fallback can be removed once no such server is running.
  launch_uuid = COALESCE($launch_uuid, $fallback_launch_uuid)
FROM
  workspace_hosts AS wh,
  variants AS v
  JOIN courses AS c ON (c.id = v.course_id)
WHERE
  w.id = $workspace_id
  AND w.state = 'launching'
  AND (
    $launch_uuid::text IS NULL
    OR w.launch_uuid = $launch_uuid
  )
  AND w.workspace_host_id = wh.id
  AND wh.instance_id = $instance_id
  AND v.workspace_id = w.id
RETURNING
  w.id,
  w.version,
  w.launch_uuid,
  c.id AS course_id,
  c.institution_id;

-- BLOCK set_workspace_launch_port
UPDATE workspaces AS w
SET
  launch_port = $launch_port
WHERE
  w.id = $id
  AND w.state = 'launching'
  AND w.launch_uuid = $launch_uuid;

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
  w.id = $id
  AND w.state = 'stopped'
  AND w.launch_uuid IS NOT DISTINCT FROM $launch_uuid
  AND w.workspace_host_id = wh.id
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
