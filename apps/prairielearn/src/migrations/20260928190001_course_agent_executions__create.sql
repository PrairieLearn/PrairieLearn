CREATE TABLE course_agent_executions (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES course_agent_conversations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  operation_id UUID NOT NULL,
  dispatch_id UUID NOT NULL DEFAULT gen_random_uuid(),
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (
    status IN (
      'admitted',
      'running',
      'completed',
      'cancelled',
      'failed',
      'interrupted'
    )
  ),
  input_tokens BIGINT CHECK (input_tokens >= 0),
  cached_input_tokens BIGINT CHECK (cached_input_tokens >= 0),
  output_tokens BIGINT CHECK (output_tokens >= 0),
  estimated_cost DOUBLE PRECISION CHECK (estimated_cost >= 0),
  model TEXT,
  pricing JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (conversation_id, operation_id)
);

CREATE INDEX course_agent_executions_conversation_id_idx ON course_agent_executions (conversation_id);
