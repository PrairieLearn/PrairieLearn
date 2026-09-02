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

CREATE TABLE course_agent_push_approvals (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES course_agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES course_agent_runs (id) ON UPDATE CASCADE ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses (id) ON UPDATE CASCADE ON DELETE CASCADE,
  requested_by BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  decided_by BIGINT REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  proposed_sha TEXT NOT NULL,
  diff_summary TEXT NOT NULL,
  diff TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'publishing',
      'denied',
      'completed',
      'failed'
    )
  ),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX course_agent_push_approvals_one_active_idx ON course_agent_push_approvals (conversation_id)
WHERE
  status IN ('pending', 'publishing');
