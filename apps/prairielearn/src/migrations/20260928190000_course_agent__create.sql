CREATE TABLE course_agent_conversations (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses (id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  external_id UUID NOT NULL UNIQUE,
  title TEXT NOT NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX course_agent_conversations_course_id_user_id_idx ON course_agent_conversations (course_id, user_id);

CREATE TABLE course_agent_operations (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES course_agent_conversations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  operation_id UUID NOT NULL,
  payload JSONB NOT NULL,
  revision INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, operation_id)
);

CREATE TABLE course_agent_proposals (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES course_agent_conversations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  operation_id UUID NOT NULL UNIQUE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  payload JSONB NOT NULL,
  digest TEXT NOT NULL,
  decision BOOLEAN,
  prepared BOOLEAN NOT NULL DEFAULT false,
  published_sha TEXT,
  sync_job_sequence_id BIGINT REFERENCES job_sequences (id) ON DELETE SET NULL ON UPDATE CASCADE,
  synced_sha TEXT,
  outcome TEXT,
  delivered BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    NOT delivered
    OR outcome IS NOT NULL
  ),
  CHECK (
    published_sha IS NULL
    OR decision IS TRUE
  ),
  UNIQUE (conversation_id, sequence)
);

CREATE UNIQUE INDEX course_agent_proposals_pending_idx ON course_agent_proposals (conversation_id)
WHERE
  NOT delivered;

CREATE TABLE course_agent_executions (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES course_agent_conversations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  operation_id UUID NOT NULL UNIQUE,
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
  finished_at TIMESTAMPTZ
);

CREATE INDEX course_agent_executions_conversation_id_idx ON course_agent_executions (conversation_id);
