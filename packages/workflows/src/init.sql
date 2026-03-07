-- BLOCK create_table
CREATE TABLE IF NOT EXISTS workflow_runs (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (
    status IN (
      'running',
      'waiting_for_input',
      'completed',
      'error',
      'canceled'
    )
  ),
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
