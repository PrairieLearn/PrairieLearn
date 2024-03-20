-- BLOCK select_workspace
SELECT
  *
FROM
  workspaces
WHERE
  id = $workspace_id;

-- BLOCK update_workspace_disk_usage_bytes
UPDATE workspaces as w
SET
  disk_usage_bytes = $disk_usage_bytes
WHERE
  w.id = $workspace_id;

-- BLOCK update_workspace_state
WITH
  old_workspace AS (
    SELECT
      *
    FROM
      workspaces
    WHERE
      id = $workspace_id
  ),
  deltas AS (
    SELECT
      CASE
        WHEN old_workspace.state = 'launching' THEN now() - old_workspace.state_updated_at
        ELSE '0 seconds'::interval
      END AS launching_delta,
      CASE
        WHEN old_workspace.state = 'running' THEN now() - old_workspace.state_updated_at
        ELSE '0 seconds'::interval
      END AS running_delta
    FROM
      old_workspace
  ),
  updated_workspace AS (
    UPDATE workspaces as w
    SET
      state = $state::enum_workspace_state,
      state_updated_at = now(),
      message = $message,
      message_updated_at = now(),
      launched_at = CASE
        WHEN $state = 'launching' THEN now()
        ELSE launched_at
      END,
      heartbeat_at = CASE
        WHEN $state = 'running' THEN now()
        ELSE heartbeat_at
      END,
      running_at = CASE
        WHEN $state = 'running' THEN now()
        ELSE running_at
      END,
      stopped_at = CASE
        WHEN $state = 'stopped' THEN now()
        ELSE stopped_at
      END,
      launching_duration = launching_duration + (
        SELECT
          launching_delta
        FROM
          deltas
      ),
      running_duration = running_duration + (
        SELECT
          running_delta
        FROM
          deltas
      )
    WHERE
      w.id = $workspace_id
    RETURNING
      *
  )
INSERT INTO
  workspace_logs (date, workspace_id, version, state, message)
VALUES
  (
    now(),
    $workspace_id,
    (
      SELECT
        version
      FROM
        old_workspace
    ),
    $state,
    $message
  );

-- BLOCK update_workspace_message
WITH
  workspace AS (
    UPDATE workspaces as w
    SET
      message = $message,
      message_updated_at = now()
    WHERE
      w.id = $workspace_id
    RETURNING
      w.version
  )
INSERT INTO
  workspace_logs (date, workspace_id, version, message)
VALUES
  (
    now(),
    $workspace_id,
    (
      SELECT
        version
      FROM
        workspace
    ),
    $message
  );
