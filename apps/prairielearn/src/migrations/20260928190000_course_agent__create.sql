CREATE TABLE course_agent_conversations (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses (id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  external_id UUID NOT NULL UNIQUE,
  title TEXT NOT NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  operation_number INTEGER NOT NULL DEFAULT 0 CHECK (operation_number >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX course_agent_conversations_course_id_user_id_idx ON course_agent_conversations (course_id, user_id);

CREATE TABLE course_agent_operations (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES course_agent_conversations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  operation_id UUID NOT NULL,
  payload JSONB NOT NULL,
  operation_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, operation_id)
);
