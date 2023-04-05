-- BLOCK select_nonterminated_workspace_hosts
SELECT
  wh.instance_id
FROM
  workspace_hosts AS wh
WHERE
  wh.state != 'terminated';

-- BLOCK select_healthy_hosts
SELECT
  wh.id,
  wh.instance_id,
  wh.load_count,
  wh.hostname
FROM
  workspace_hosts AS wh
WHERE
  wh.state = 'ready'
  OR wh.state = 'draining';

-- BLOCK set_host_unhealthy
UPDATE workspace_hosts AS wh
SET
  state = 'unhealthy',
  unhealthy_at = NOW(),
  unhealthy_reason = 'health check failed'
WHERE
  wh.instance_id = $instance_id
  AND wh.state IN ('launching', 'ready', 'draining');

-- BLOCK add_terminating_hosts
INSERT INTO
  workspace_hosts (state, state_changed_at, instance_id)
SELECT
  'terminating',
  NOW(),
  UNNEST($instances)
ON CONFLICT (instance_id) DO
UPDATE
SET
  state = EXCLUDED.state,
  state_changed_at = EXCLUDED.state_changed_at;

-- BLOCK set_terminated_hosts_if_not_launching
WITH
  terminated_workspace_hosts AS (
    UPDATE workspace_hosts AS wh
    SET
      state = 'terminated',
      terminated_at = NOW()
    WHERE
      wh.instance_id IN (
        SELECT
          UNNEST($instances)
      )
      AND wh.state != 'launching'
    RETURNING
      wh.id
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
  workspace_id,
  state,
  message;
