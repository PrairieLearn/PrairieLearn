CREATE TABLE course_agent_conversations (
  id UUID PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses (id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  title TEXT NOT NULL DEFAULT 'New chat',
  sandbox_id TEXT NOT NULL UNIQUE,
  runtime_status TEXT NOT NULL DEFAULT 'offline' CHECK (
    runtime_status IN (
      'starting',
      'running',
      'waiting_for_user',
      'offline',
      'failed'
    )
  ),
  last_error TEXT,
  conversation_state TEXT NOT NULL DEFAULT 'waiting_for_user' CHECK (
    conversation_state IN (
      'working',
      'waiting_for_user',
      'validating_change',
      'waiting_for_approval',
      'publishing',
      'syncing',
      'refreshing_workspace',
      'resuming_agent',
      'failed'
    )
  ),
  sandbox_state TEXT NOT NULL DEFAULT 'offline' CHECK (
    sandbox_state IN ('offline', 'starting', 'ready', 'suspending')
  ),
  lifecycle_revision INTEGER NOT NULL DEFAULT 0 CHECK (lifecycle_revision >= 0),
  sandbox_generation INTEGER NOT NULL DEFAULT 0 CHECK (sandbox_generation >= 0),
  idle_expires_at TIMESTAMPTZ,
  active_run_expires_at TIMESTAMPTZ,
  process_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX course_agent_conversations_course_user_idx ON course_agent_conversations (course_id, user_id, updated_at DESC)
WHERE
  deleted_at IS NULL;

CREATE TABLE course_agent_runs (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES course_agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  prompt_digest TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX course_agent_runs_one_active_per_conversation_idx ON course_agent_runs (conversation_id)
WHERE
  status = 'running';

CREATE TABLE course_agent_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES course_agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  run_id UUID REFERENCES course_agent_runs (id) ON UPDATE CASCADE ON DELETE SET NULL,
  authn_user_id BIGINT REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
  conversation_id UUID NOT NULL REFERENCES course_agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  run_id UUID REFERENCES course_agent_runs (id) ON UPDATE CASCADE ON DELETE SET NULL,
  sequence BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, sequence)
);

CREATE TABLE course_agent_workspace_backups (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES course_agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  sandbox_id TEXT NOT NULL,
  backup_handle JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX course_agent_workspace_backups_conversation_id_idx ON course_agent_workspace_backups (conversation_id, id DESC);
