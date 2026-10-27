CREATE TABLE IF NOT EXISTS course_agent_conversations (
  id bigserial PRIMARY KEY,
  -- Names the conversation's Durable Object in the course agent service.
  agent_conversation_id uuid NOT NULL UNIQUE,
  course_id bigint NOT NULL REFERENCES courses ON UPDATE CASCADE ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  usage_input_tokens bigint NOT NULL DEFAULT 0 CHECK (usage_input_tokens >= 0),
  usage_input_tokens_cache_read bigint NOT NULL DEFAULT 0 CHECK (usage_input_tokens_cache_read >= 0),
  usage_output_tokens bigint NOT NULL DEFAULT 0 CHECK (usage_output_tokens >= 0),
  usage_output_tokens_reasoning bigint NOT NULL DEFAULT 0 CHECK (usage_output_tokens_reasoning >= 0),
  usage_cost_milli_dollars bigint NOT NULL DEFAULT 0 CHECK (usage_cost_milli_dollars >= 0)
);

CREATE INDEX IF NOT EXISTS course_agent_conversations_course_id_user_id_created_at_id_idx ON course_agent_conversations (course_id, user_id, created_at, id);
