DROP TABLE IF EXISTS ai_question_generation_messages;
DROP TABLE IF EXISTS ai_question_generation_parts;

CREATE TYPE enum_ai_question_generation_message_role AS ENUM ('system', 'user', 'assistant');

CREATE TABLE IF NOT EXISTS ai_question_generation_messages (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES questions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  role enum_ai_question_generation_message_role NOT NULL,
  parts JSONB NULL NULL DEFAULT '[]'::JSONB,

  -- TODO: track cached and reasoning tokens separately?
  usage_input_tokens INT NOT NULL DEFAULT 0,
  usage_output_tokens INT NOT NULL DEFAULT 0,
  usage_total_tokens INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_question_generation_parts (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES ai_question_generation_messages (id) ON UPDATE CASCADE ON DELETE CASCADE,
  part_index INT NOT NULL,
  data JSONB NOT NULL,
  UNIQUE (message_id, part_index)
);
