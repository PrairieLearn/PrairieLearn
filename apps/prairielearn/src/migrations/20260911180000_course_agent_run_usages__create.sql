CREATE TABLE course_agent_run_usages (
  run_id uuid PRIMARY KEY REFERENCES course_agent_runs (id) ON UPDATE CASCADE ON DELETE CASCADE,
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cache_read_tokens bigint NOT NULL DEFAULT 0 CHECK (cache_read_tokens >= 0),
  cache_write_tokens bigint NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  reasoning_tokens bigint NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  normalized_total_tokens bigint NOT NULL DEFAULT 0 CHECK (normalized_total_tokens >= 0),
  estimated_cost_milli_dollars double precision NOT NULL DEFAULT 0 CHECK (estimated_cost_milli_dollars >= 0),
  finalized_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course_agent_usage_receipts (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES course_agent_runs (id) ON UPDATE CASCADE ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  usage jsonb,
  estimated_cost_milli_dollars double precision,
  provider_cost_milli_dollars double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX course_agent_usage_receipts_run_id_idx ON course_agent_usage_receipts (run_id);
