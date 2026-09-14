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
  commit_message TEXT NOT NULL,
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
