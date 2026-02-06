CREATE TYPE enum_ai_question_generation_message_role AS ENUM('user', 'assistant');

CREATE TYPE enum_ai_question_generation_message_status AS ENUM('streaming', 'completed', 'errored', 'canceled');

CREATE TABLE IF NOT EXISTS ai_question_generation_messages (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES questions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  authn_user_id BIGINT REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  job_sequence_id BIGINT REFERENCES job_sequences (id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status enum_ai_question_generation_message_status NOT NULL,
  role enum_ai_question_generation_message_role NOT NULL,
  parts JSONB NOT NULL DEFAULT '[]'::JSONB,
  model TEXT,
  usage_input_tokens INT NOT NULL DEFAULT 0,
  usage_input_tokens_cache_read INT NOT NULL DEFAULT 0,
  usage_input_tokens_cache_write INT NOT NULL DEFAULT 0,
  usage_output_tokens INT NOT NULL DEFAULT 0,
  usage_output_tokens_reasoning INT NOT NULL DEFAULT 0,
  include_in_context BOOLEAN NOT NULL DEFAULT TRUE,
  -- User messages never have a model. Assistant messages always have one.
  CONSTRAINT ai_question_generation_messages_model_check CHECK (
    (
      role = 'user'
      AND model IS NULL
    )
    OR (
      role = 'assistant'
      AND model IS NOT NULL
    )
  ),
  -- Only user messages should be attributed to an authn_user_id.
  CONSTRAINT ai_question_generation_messages_authn_user_check CHECK (
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

CREATE INDEX IF NOT EXISTS ai_question_generation_messages_question_id_idx ON ai_question_generation_messages (question_id);
