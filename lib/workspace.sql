-- BLOCK select_workspace_host
SELECT
  wh.*
FROM
  workspace_hosts AS wh
  JOIN workspaces AS w ON (w.workspace_host_id = wh.id)
WHERE
  w.id = $workspace_id;

-- BLOCK select_workspace
SELECT
  *
FROM
  workspaces
WHERE
  id = $workspace_id;

-- BLOCK select_and_lock_workspace
SELECT
  *
FROM
  workspaces
WHERE
  id = $workspace_id
FOR NO KEY UPDATE;

-- BLOCK select_workspace_data
SELECT
  to_jsonb(w.*) AS workspace,
  to_jsonb(v.*) AS variant,
  to_jsonb(q.*) AS question,
  to_jsonb(c.*) AS course
FROM
  workspaces AS w
  JOIN variants AS v ON (v.workspace_id = w.id)
  JOIN questions AS q ON (q.id = v.question_id)
  JOIN pl_courses AS c ON (c.id = q.course_id)
WHERE
  w.id = $workspace_id;

-- BLOCK select_workspace_state
SELECT
  w.state
FROM
  workspaces as w
WHERE
  w.id = $workspace_id;

-- BLOCK select_workspace_version
SELECT
  w.version AS workspace_version
FROM
  workspaces AS w
WHERE
  w.id = $workspace_id;

-- BLOCK select_workspace_version_and_graded_files
SELECT
  w.version AS workspace_version,
  q.workspace_graded_files
FROM
  questions AS q
  JOIN variants AS v ON (v.question_id = q.id)
  JOIN workspaces AS w ON (v.workspace_id = w.id)
WHERE
  w.id = $workspace_id;

-- BLOCK update_workspace_heartbeat_at_now
UPDATE workspaces AS w
SET
  heartbeat_at = now()
WHERE
  w.id = $workspace_id
RETURNING
  heartbeat_at;

-- BLOCK update_workspace_homedir_location
UPDATE workspaces AS W
SET
  homedir_location = $homedir_location
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
  workspace_logs (workspace_id, version, state, message)
VALUES
  (
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
  workspace_logs (workspace_id, version, message)
VALUES
  (
    $workspace_id,
    (
      SELECT
        version
      FROM
        workspace
    ),
    $message
  );
