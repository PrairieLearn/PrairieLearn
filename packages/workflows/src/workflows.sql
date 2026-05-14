-- BLOCK insert_run
INSERT INTO
  workflow_runs (type, status, state, context)
VALUES
  ($type, $status, $state::jsonb, $context::jsonb)
RETURNING
  *;

-- BLOCK select_run_by_id
SELECT
  *
FROM
  workflow_runs
WHERE
  id = $id;

-- BLOCK select_active_run
SELECT
  *
FROM
  workflow_runs
WHERE
  type = $type
  AND status IN ('running', 'waiting')
  AND context @> $context_filter::jsonb
ORDER BY
  created_at DESC
LIMIT
  1;

-- BLOCK acquire_lock
UPDATE workflow_runs
SET
  locked_by = $locked_by,
  locked_at = now(),
  heartbeat_at = now(),
  updated_at = now()
WHERE
  id = $id
  AND status = 'running'
  AND (
    locked_by IS NULL
    OR heartbeat_at < now() - interval '2 minutes'
  )
RETURNING
  *;

-- BLOCK update_heartbeat
UPDATE workflow_runs
SET
  heartbeat_at = now()
WHERE
  id = $id
  AND locked_by = $locked_by;

-- BLOCK release_lock
UPDATE workflow_runs
SET
  locked_by = NULL,
  locked_at = NULL,
  heartbeat_at = NULL,
  updated_at = now()
WHERE
  id = $id
  AND locked_by = $locked_by;

-- BLOCK update_step
UPDATE workflow_runs
SET
  state = $state::jsonb,
  status = $status,
  error_message = $error_message,
  updated_at = now(),
  completed_at = CASE
    WHEN $status IN ('completed', 'error', 'canceled') THEN now()
    ELSE completed_at
  END
WHERE
  id = $id
  AND locked_by = $locked_by
  AND status NOT IN ('completed', 'error', 'canceled')
RETURNING
  *;

-- BLOCK cancel_run
UPDATE workflow_runs
SET
  status = 'canceled',
  updated_at = now(),
  completed_at = now(),
  locked_by = NULL,
  locked_at = NULL,
  heartbeat_at = NULL
WHERE
  id = $id
  AND status NOT IN ('completed', 'error', 'canceled')
RETURNING
  *;

-- BLOCK continue_run
UPDATE workflow_runs
SET
  state = state || $state_update::jsonb,
  status = 'running',
  locked_by = NULL,
  locked_at = NULL,
  heartbeat_at = NULL,
  updated_at = now()
WHERE
  id = $id
  AND status = 'waiting'
RETURNING
  *;

-- BLOCK select_stale_runs
SELECT
  *
FROM
  workflow_runs
WHERE
  status = 'running'
  AND locked_by IS NOT NULL
  AND heartbeat_at < now() - interval '2 minutes'
ORDER BY
  created_at ASC;

-- BLOCK select_unlocked_running_runs
SELECT
  *
FROM
  workflow_runs
WHERE
  status = 'running'
  AND locked_by IS NULL
ORDER BY
  created_at ASC;

-- BLOCK append_output
UPDATE workflow_runs
SET
  output = output || $text,
  updated_at = now()
WHERE
  id = $id;
