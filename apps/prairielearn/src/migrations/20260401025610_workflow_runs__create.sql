CREATE TYPE enum_workflow_run_status AS ENUM(
  'running',
  'waiting_for_input',
  'completed',
  'error',
  'canceled'
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  status enum_workflow_run_status NOT NULL DEFAULT 'running',
  phase text,
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

CREATE INDEX IF NOT EXISTS workflow_runs_type_status_idx ON workflow_runs (type, status);

-- Partial index for crash recovery: finds running rows with stale or missing locks.
CREATE INDEX IF NOT EXISTS workflow_runs_status_running_idx ON workflow_runs (status, heartbeat_at)
WHERE
  status = 'running';

-- GIN index for context containment queries used by getActiveWorkflowRun.
CREATE INDEX IF NOT EXISTS workflow_runs_context_idx ON workflow_runs USING gin (context);
