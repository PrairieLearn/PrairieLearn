-- BLOCK create_workflow_runs_table
-- Mirrors the production migration, except that `status` is a `text` column
-- with a CHECK constraint instead of the `enum_workflow_run_status` enum,
-- so the test setup doesn't need to create the enum type.
CREATE TABLE IF NOT EXISTS workflow_runs (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (
    status IN (
      'running',
      'waiting',
      'completed',
      'error',
      'canceled'
    )
  ),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text,
  output text NOT NULL DEFAULT ''
);

-- BLOCK create_type_status_index
CREATE INDEX IF NOT EXISTS workflow_runs_type_status_idx ON workflow_runs (type, status);

-- BLOCK create_status_running_index
CREATE INDEX IF NOT EXISTS workflow_runs_status_running_idx ON workflow_runs (status, heartbeat_at)
WHERE
  status = 'running';

-- BLOCK create_context_index
CREATE INDEX IF NOT EXISTS workflow_runs_context_idx ON workflow_runs USING gin (context);

-- BLOCK insert_run_with_stale_lock
-- Simulates a worker that crashed mid-execution: status is 'running', the
-- row has a lock, but the heartbeat is 5 minutes stale (recovery threshold
-- is 2 minutes).
INSERT INTO
  workflow_runs (
    type,
    status,
    state,
    locked_by,
    locked_at,
    heartbeat_at
  )
VALUES
  (
    $type,
    'running',
    $state::jsonb,
    'dead-worker',
    now() - interval '10 minutes',
    now() - interval '5 minutes'
  )
RETURNING
  id;

-- BLOCK insert_run_with_fresh_lock
-- Simulates a run that another worker is actively executing: status is
-- 'running' with a current heartbeat.
INSERT INTO
  workflow_runs (
    type,
    status,
    state,
    locked_by,
    locked_at,
    heartbeat_at
  )
VALUES
  (
    $type,
    'running',
    $state::jsonb,
    'other-worker',
    now(),
    now()
  )
RETURNING
  id;
