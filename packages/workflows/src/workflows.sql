-- BLOCK create_table
CREATE TABLE IF NOT EXISTS workflow_runs (
  id BIGSERIAL PRIMARY KEY,
  workflow_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'running',
      'waiting_for_input',
      'completed',
      'failed',
      'canceled'
    )
  ),
  phase TEXT NOT NULL DEFAULT 'initial',
  state JSONB NOT NULL DEFAULT '{}'::JSONB,
  context JSONB NOT NULL DEFAULT '{}'::JSONB,
  output TEXT NOT NULL DEFAULT '',
  locked_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  error_message TEXT,
  max_steps INT NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- BLOCK create_indexes
CREATE INDEX IF NOT EXISTS workflow_runs_type_status_idx ON workflow_runs (workflow_type, status);

-- BLOCK insert_workflow_run
INSERT INTO
  workflow_runs (
    workflow_type,
    status,
    phase,
    state,
    context,
    max_steps
  )
VALUES
  (
    $workflow_type,
    'pending',
    $phase,
    $state::JSONB,
    $context::JSONB,
    $max_steps
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
  workflow_type = $workflow_type
  AND context @> $context::JSONB
  AND status NOT IN ('completed', 'failed', 'canceled')
ORDER BY
  created_at DESC
LIMIT
  1;

-- BLOCK acquire_soft_lock
UPDATE workflow_runs
SET
  locked_at = NOW(),
  heartbeat_at = NOW(),
  status = 'running',
  updated_at = NOW()
WHERE
  id = $id
  AND (
    locked_at IS NULL
    OR heartbeat_at < NOW() - INTERVAL '2 minutes'
  )
RETURNING
  *;

-- BLOCK update_heartbeat
UPDATE workflow_runs
SET
  heartbeat_at = NOW()
WHERE
  id = $id;

-- BLOCK release_soft_lock
UPDATE workflow_runs
SET
  locked_at = NULL,
  heartbeat_at = NULL,
  updated_at = NOW()
WHERE
  id = $id;

-- BLOCK persist_step_result
UPDATE workflow_runs
SET
  status = $status,
  phase = $phase,
  state = $state::JSONB,
  output = $output,
  error_message = $error_message,
  updated_at = NOW(),
  completed_at = CASE
    WHEN $status IN ('completed', 'failed') THEN NOW()
    ELSE completed_at
  END
WHERE
  id = $id
RETURNING
  *;

-- BLOCK cancel_workflow
UPDATE workflow_runs
SET
  status = 'canceled',
  updated_at = NOW(),
  locked_at = NULL,
  heartbeat_at = NULL
WHERE
  id = $id
  AND status NOT IN ('completed', 'failed', 'canceled')
RETURNING
  *;

-- BLOCK set_running
UPDATE workflow_runs
SET
  status = 'running',
  state = $state::JSONB,
  updated_at = NOW()
WHERE
  id = $id
  AND status = 'waiting_for_input'
RETURNING
  *;
