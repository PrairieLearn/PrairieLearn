-- BLOCK select_workspace
SELECT
  *
FROM
  workspaces
WHERE
  id = $workspace_id;

-- BLOCK update_workspace_disk_usage_bytes
UPDATE workspaces AS w
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
      AND (
        NOT $launch_guarded::boolean
        OR (
          state = 'launching'
          AND launch_uuid IS NOT DISTINCT FROM $expected_launch_uuid
        )
      )
    FOR NO KEY UPDATE
  ),
  -- An unguarded update can wait on the lock above for a transition that
  -- committed after this transaction started, so clamp the elapsed time.
  deltas AS (
    SELECT
      CASE
        WHEN old_workspace.state = 'launching' THEN GREATEST(
          now() - old_workspace.state_updated_at,
          '0 seconds'::interval
        )
        ELSE '0 seconds'::interval
      END AS launching_delta,
      CASE
        WHEN old_workspace.state = 'running' THEN GREATEST(
          now() - old_workspace.state_updated_at,
          '0 seconds'::interval
        )
        ELSE '0 seconds'::interval
      END AS running_delta
    FROM
      old_workspace
  ),
  updated_workspace AS (
    UPDATE workspaces AS w
    SET
      state = $state::enum_workspace_state,
      -- Every launch gets a new identity, so writes from an earlier launch of
      -- this workspace can never match the current one.
      launch_uuid = CASE
        WHEN $state = 'launching' THEN $new_launch_uuid
        ELSE w.launch_uuid
      END,
      hostname = COALESCE($hostname, w.hostname),
      state_updated_at = now(),
      message = $message,
      message_updated_at = now(),
      launched_at = CASE
        WHEN $state = 'launching' THEN now()
        ELSE w.launched_at
      END,
      heartbeat_at = CASE
        WHEN $state = 'running' THEN now()
        ELSE w.heartbeat_at
      END,
      running_at = CASE
        WHEN $state = 'running' THEN now()
        ELSE w.running_at
      END,
      stopped_at = CASE
        WHEN $state = 'stopped' THEN now()
        ELSE w.stopped_at
      END,
      launching_duration = w.launching_duration + deltas.launching_delta,
      running_duration = w.running_duration + deltas.running_delta
    FROM
      old_workspace
      CROSS JOIN deltas
    WHERE
      w.id = old_workspace.id
    RETURNING
      w.*
  )
INSERT INTO
  workspace_logs (date, workspace_id, version, state, message)
SELECT
  now(),
  id,
  version,
  state,
  message
FROM
  updated_workspace
RETURNING
  (
    SELECT
      launching_delta + running_delta
    FROM
      deltas
  ) AS delta;

-- BLOCK update_workspace_launch_message
WITH
  workspace AS (
    UPDATE workspaces AS w
    SET
      message = $message,
      message_updated_at = now()
    WHERE
      w.id = $workspace_id
      AND w.state = 'launching'
      AND w.launch_uuid = $launch_uuid
    RETURNING
      w.id,
      w.version
  ),
  workspace_log AS (
    INSERT INTO
      workspace_logs (date, workspace_id, version, message)
    SELECT
      now(),
      workspace.id,
      workspace.version,
      $message
    FROM
      workspace
  )
SELECT
  EXISTS (
    SELECT
      1
    FROM
      workspace
  );

-- BLOCK select_workspace_launch_is_current
SELECT
  EXISTS (
    SELECT
      1
    FROM
      workspaces AS w
    WHERE
      w.id = $workspace_id
      AND w.state = 'launching'
      AND w.launch_uuid = $launch_uuid
  );

-- BLOCK update_workspace_message
WITH
  workspace AS (
    UPDATE workspaces AS w
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

-- BLOCK update_course_instance_usages_for_workspace
INSERT INTO
  course_instance_usages (
    type,
    institution_id,
    course_id,
    course_instance_id,
    date,
    user_id,
    include_in_statistics,
    duration
  )
SELECT
  'Workspace',
  i.id AS institution_id,
  c.id AS course_id,
  ci.id AS course_instance_id,
  date_trunc('day', w.state_updated_at, 'UTC'),
  -- Use v.authn_user_id because we don't care about really tracking the
  -- effective user, we are only using this to avoid contention when there are
  -- many users updating simultaneously.
  v.authn_user_id,
  coalesce(ai.include_in_statistics, FALSE),
  make_interval(
    secs => $duration_milliseconds::double precision / 1000.0
  )
FROM
  workspaces AS w
  JOIN variants AS v ON (v.workspace_id = w.id)
  JOIN questions AS q ON (q.id = v.question_id)
  JOIN courses AS c ON (c.id = v.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  w.id = $workspace_id
ON CONFLICT (
  type,
  course_id,
  course_instance_id,
  date,
  user_id
) DO UPDATE
SET
  duration = course_instance_usages.duration + EXCLUDED.duration;
