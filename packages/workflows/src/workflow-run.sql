-- BLOCK insert_workflow_run
INSERT INTO
  workflow_runs (type, status, state, context, phase)
VALUES
  (
    $type,
    'running',
    $state::jsonb,
    $context::jsonb,
    $phase
  )
RETURNING
  *;

-- BLOCK select_workflow_run
SELECT
  *
FROM
  workflow_runs
WHERE
  id = $id;

-- BLOCK select_active_workflow_run
SELECT
  *
FROM
  workflow_runs
WHERE
  type = $type
  AND status IN ('running', 'waiting_for_input')
  AND context @> $context_filter::jsonb
ORDER BY
  created_at DESC
LIMIT
  1;

-- BLOCK update_workflow_run_after_step
UPDATE workflow_runs
SET
  status = $status,
  state = $state::jsonb,
  phase = $phase,
  error_message = $error_message,
  output = $output,
  updated_at = now(),
  completed_at = CASE
    WHEN $status IN ('completed', 'error', 'canceled') THEN now()
    ELSE completed_at
  END
WHERE
  id = $id
RETURNING
  *;

-- BLOCK acquire_lock
UPDATE workflow_runs
SET
  locked_by = $lock_id,
  locked_at = now(),
  heartbeat_at = now()
WHERE
  id = $id
  AND status = 'running'
  AND (
    locked_by IS NULL
    OR heartbeat_at < now() - interval '2 minutes'
  )
RETURNING
  *;

-- BLOCK release_lock
UPDATE workflow_runs
SET
  locked_by = NULL,
  locked_at = NULL,
  heartbeat_at = NULL,
  updated_at = now()
WHERE
  id = $id
  AND locked_by = $lock_id;

-- BLOCK update_heartbeat
UPDATE workflow_runs
SET
  heartbeat_at = now()
WHERE
  id = $id
  AND locked_by = $lock_id;

-- BLOCK cancel_workflow_run
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
  AND status IN ('running', 'waiting_for_input')
RETURNING
  *;

-- BLOCK continue_workflow_run
UPDATE workflow_runs
SET
  status = 'running',
  state = state || $state_update::jsonb,
  updated_at = now()
WHERE
  id = $id
  AND status = 'waiting_for_input'
RETURNING
  *;
