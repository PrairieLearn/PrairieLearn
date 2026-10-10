CREATE TABLE course_agent_conversations (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses (id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  external_id UUID NOT NULL UNIQUE,
  title TEXT NOT NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  last_finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX course_agent_conversations_course_id_user_id_idx ON course_agent_conversations (course_id, user_id);
