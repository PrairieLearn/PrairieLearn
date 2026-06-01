-- BLOCK create_workflow_run_status_enum
-- Mirrors the production migration. Needed because `update_step` casts
-- the status parameter to `enum_workflow_run_status`. The test database
-- is dropped and recreated per worker so this is unconditional.
CREATE TYPE enum_workflow_run_status AS ENUM(
  'running',
  'waiting',
  'completed',
  'error',
  'canceled'
);

-- BLOCK create_workflow_runs_table
CREATE TABLE IF NOT EXISTS workflow_runs (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  status enum_workflow_run_status NOT NULL DEFAULT 'running',
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
