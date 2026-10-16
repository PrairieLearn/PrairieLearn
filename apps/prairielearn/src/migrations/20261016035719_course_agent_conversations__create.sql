CREATE TABLE IF NOT EXISTS course_agent_conversations (
  id bigserial PRIMARY KEY,
  -- Names the conversation's Durable Object in the course agent service.
  agent_conversation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  course_id bigint NOT NULL REFERENCES courses ON UPDATE CASCADE ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_agent_conversations_course_id_user_id_created_at_id_idx ON course_agent_conversations (course_id, user_id, created_at, id);
