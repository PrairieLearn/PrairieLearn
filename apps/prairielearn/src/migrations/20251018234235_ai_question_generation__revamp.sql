-- TODO: remove before merging.
DROP TABLE IF EXISTS ai_question_generation_parts;

DROP TABLE IF EXISTS ai_question_generation_messages;

DROP TYPE IF EXISTS enum_ai_question_generation_message_role;

DROP TYPE IF EXISTS enum_ai_question_generation_message_status;

CREATE TYPE enum_ai_question_generation_message_role AS ENUM('system', 'user', 'assistant');

CREATE TYPE enum_ai_question_generation_message_status AS ENUM(
  'pending',
  'streaming',
  'completed',
  'errored',
  'canceled'
);

CREATE TABLE IF NOT EXISTS ai_question_generation_messages (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES questions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  job_sequence_id BIGINT REFERENCES job_sequences (id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status enum_ai_question_generation_message_status NOT NULL DEFAULT 'pending',
  role enum_ai_question_generation_message_role NOT NULL,
  parts JSONB NULL NULL DEFAULT '[]'::JSONB,
  -- TODO: track cached and reasoning tokens separately?
  usage_input_tokens INT NOT NULL DEFAULT 0,
  usage_output_tokens INT NOT NULL DEFAULT 0,
  usage_total_tokens INT NOT NULL DEFAULT 0
);
