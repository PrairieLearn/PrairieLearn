CREATE TYPE enum_workflow_run_status AS ENUM(
  'running',
  'waiting',
  'completed',
  'error',
  'canceled'
);

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
  output text NOT NULL DEFAULT '',
  CONSTRAINT workflow_runs_context_type_check CHECK (jsonb_typeof(context) = 'object'),
  CONSTRAINT workflow_runs_context_value_type_check CHECK (
    NOT jsonb_path_exists(context, '$.* ? (@.type() != "string")')
  ),
  CONSTRAINT workflow_runs_state_type_check CHECK (jsonb_typeof(state) = 'object')
);

CREATE INDEX IF NOT EXISTS workflow_runs_type_status_idx ON workflow_runs (type, status);

-- Partial index for crash recovery: finds running rows with stale or missing locks.
CREATE INDEX IF NOT EXISTS workflow_runs_status_running_idx ON workflow_runs (status, heartbeat_at)
WHERE
  status = 'running';

-- GIN index for context containment queries used by getActiveWorkflowRun.
CREATE INDEX IF NOT EXISTS workflow_runs_context_idx ON workflow_runs USING gin (context);
