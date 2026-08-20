CREATE TYPE enum_agent_run_status AS ENUM(
  'pending',
  'running',
  'stopping',
  'completed',
  'failed',
  'canceled'
);

CREATE TYPE enum_agent_operation_status AS ENUM(
  'pending',
  'running',
  'completed',
  'failed',
  'canceled'
);

CREATE TABLE agent_conversations (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses (id) ON UPDATE CASCADE ON DELETE CASCADE,
  authn_user_id BIGINT REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  user_id BIGINT REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  title TEXT,
  repository_url TEXT,
  repository_branch TEXT,
  repository_base_sha TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (
    (
      repository_url IS NULL
      AND repository_branch IS NULL
      AND repository_base_sha IS NULL
    )
    OR (
      repository_url IS NOT NULL
      AND repository_branch IS NOT NULL
      AND repository_base_sha IS NOT NULL
    )
  )
);

CREATE INDEX agent_conversations_course_id_authn_user_id_idx ON agent_conversations (course_id, authn_user_id)
WHERE
  deleted_at IS NULL;

CREATE TABLE agent_draft_questions (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  requested_qid TEXT NOT NULL,
  question_id BIGINT REFERENCES questions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, requested_qid),
  UNIQUE (question_id)
);

CREATE TABLE agent_runs (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  authn_user_id BIGINT REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  user_id BIGINT REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  status enum_agent_run_status NOT NULL DEFAULT 'pending',
  message TEXT NOT NULL,
  capability_jti UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  capability_expires_at TIMESTAMPTZ NOT NULL,
  allowed_tools TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  base_commit_sha TEXT,
  claude_session_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  stop_requested_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX agent_runs_one_active_per_conversation_idx ON agent_runs (conversation_id)
WHERE
  status IN ('pending', 'running', 'stopping');

CREATE INDEX agent_runs_conversation_id_created_at_idx ON agent_runs (conversation_id, created_at);

CREATE TABLE agent_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  conversation_id BIGINT NOT NULL REFERENCES agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  run_id BIGINT REFERENCES agent_runs (id) ON UPDATE CASCADE ON DELETE CASCADE,
  sequence BIGINT NOT NULL,
  type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  operation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, sequence)
);

CREATE INDEX agent_events_run_id_idx ON agent_events (run_id, id);

CREATE TABLE agent_operations (
  id BIGSERIAL PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  run_id BIGINT NOT NULL REFERENCES agent_runs (id) ON UPDATE CASCADE ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  status enum_agent_operation_status NOT NULL DEFAULT 'pending',
  request JSONB NOT NULL,
  response JSONB,
  error TEXT,
  expected_revision TEXT,
  commit_sha TEXT,
  job_sequence_id BIGINT REFERENCES job_sequences (id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX agent_operations_run_id_created_at_idx ON agent_operations (run_id, created_at);

CREATE TABLE agent_artifacts (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  run_id BIGINT REFERENCES agent_runs (id) ON UPDATE CASCADE ON DELETE CASCADE,
  operation_id BIGINT REFERENCES agent_operations (id) ON UPDATE CASCADE ON DELETE SET NULL,
  kind TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX agent_artifacts_conversation_id_idx ON agent_artifacts (conversation_id)
WHERE
  deleted_at IS NULL;
