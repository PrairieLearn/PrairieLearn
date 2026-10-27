CREATE TABLE course_agent_budget_requests (
  id bigserial PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES course_agent_conversations (id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  sequence bigint NOT NULL CHECK (sequence > 0),
  window_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  request jsonb NOT NULL,
  response jsonb NOT NULL,
  http_status integer NOT NULL,
  granted_milli_dollars bigint NOT NULL CHECK (granted_milli_dollars >= 0),
  UNIQUE (conversation_id, sequence)
);

CREATE INDEX course_agent_budget_requests_user_window_idx ON course_agent_budget_requests (user_id, window_start)
WHERE
  granted_milli_dollars > 0;
