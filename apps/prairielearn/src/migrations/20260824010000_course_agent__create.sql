CREATE TYPE enum_course_agent_runtime_status AS ENUM(
  'unallocated',
  'booting',
  'preparing',
  'cloning',
  'restoring',
  'ready',
  'running',
  'finalizing',
  'syncing',
  'checkpointing',
  'destroying',
  'offline',
  'error'
);

CREATE TYPE enum_course_agent_run_status AS ENUM(
  'queued',
  'preparing',
  'running',
  'finalizing',
  'syncing',
  'checkpointing',
  'completed',
  'failed',
  'canceled'
);

CREATE TYPE enum_course_agent_message_role AS ENUM('user', 'assistant');

CREATE TYPE enum_course_agent_message_status AS ENUM(
  'pending',
  'streaming',
  'completed',
  'errored',
  'canceled'
);

CREATE TYPE enum_course_agent_backup_reason AS ENUM(
  'idle_timeout',
  'test_kill',
  'conversation_deleted'
);

CREATE TABLE course_agent_conversations (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses (id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  sandbox_id TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  runtime_status enum_course_agent_runtime_status NOT NULL DEFAULT 'unallocated',
  container_id TEXT,
  workspace_path TEXT NOT NULL DEFAULT '/workspace',
  course_path TEXT,
  last_activity_at TIMESTAMPTZ,
  idle_deadline_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX course_agent_conversations_course_user_idx ON course_agent_conversations (course_id, user_id)
WHERE
  deleted_at IS NULL;

CREATE TABLE course_agent_runs (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES course_agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  status enum_course_agent_run_status NOT NULL DEFAULT 'queued',
  prompt_digest TEXT NOT NULL,
  base_commit_sha TEXT,
  commit_sha TEXT,
  pushed_sha TEXT,
  sync_job_sequence_id BIGINT REFERENCES job_sequences (id) ON UPDATE CASCADE ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX course_agent_runs_one_active_per_conversation_idx ON course_agent_runs (conversation_id)
WHERE
  status IN (
    'queued',
    'preparing',
    'running',
    'finalizing',
    'syncing',
    'checkpointing'
  );

CREATE TABLE course_agent_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES course_agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  run_id BIGINT REFERENCES course_agent_runs (id) ON UPDATE CASCADE ON DELETE SET NULL,
  authn_user_id BIGINT REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  role enum_course_agent_message_role NOT NULL,
  status enum_course_agent_message_status NOT NULL,
  parts JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT course_agent_messages_authn_user_check CHECK (
    (
      role = 'user'
      AND authn_user_id IS NOT NULL
    )
    OR (
      role = 'assistant'
      AND authn_user_id IS NULL
    )
  )
);

CREATE INDEX course_agent_messages_conversation_id_idx ON course_agent_messages (conversation_id, id);

CREATE TABLE course_agent_events (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES course_agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  run_id BIGINT REFERENCES course_agent_runs (id) ON UPDATE CASCADE ON DELETE CASCADE,
  sequence BIGINT NOT NULL,
  external_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, sequence)
);

CREATE INDEX course_agent_events_run_id_idx ON course_agent_events (run_id, id);

CREATE TABLE course_agent_workspace_backups (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES course_agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  run_id BIGINT REFERENCES course_agent_runs (id) ON UPDATE CASCADE ON DELETE SET NULL,
  sandbox_id TEXT NOT NULL,
  backup_handle JSONB NOT NULL,
  workspace_manifest_version INT NOT NULL,
  course_commit_sha TEXT,
  reason enum_course_agent_backup_reason NOT NULL,
  size_bytes BIGINT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX course_agent_workspace_backups_conversation_id_idx ON course_agent_workspace_backups (conversation_id, id DESC);
