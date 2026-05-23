CREATE TYPE enum_ai_grading_message_phase AS ENUM('generate', 'edit');

CREATE TABLE IF NOT EXISTS ai_grading_messages (
  id BIGSERIAL PRIMARY KEY,
  assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  authn_user_id BIGINT REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  job_sequence_id BIGINT REFERENCES job_sequences (id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status enum_ai_question_generation_message_status NOT NULL,
  role enum_ai_question_generation_message_role NOT NULL,
  phase enum_ai_grading_message_phase NOT NULL,
  parts JSONB NOT NULL DEFAULT '[]'::JSONB,
  model TEXT,
  usage_input_tokens INT NOT NULL DEFAULT 0,
  usage_input_tokens_cache_read INT NOT NULL DEFAULT 0,
  usage_input_tokens_cache_write INT NOT NULL DEFAULT 0,
  usage_output_tokens INT NOT NULL DEFAULT 0,
  usage_output_tokens_reasoning INT NOT NULL DEFAULT 0,
  include_in_context BOOLEAN NOT NULL DEFAULT TRUE,
  workflow_run_id BIGINT REFERENCES workflow_runs (id) ON DELETE SET NULL,
  rubric_snapshot JSONB,
  CONSTRAINT ai_grading_messages_model_check CHECK (
    (
      role = 'user'
      AND model IS NULL
    )
    OR (
      role = 'assistant'
      AND model IS NOT NULL
    )
  ),
  CONSTRAINT ai_grading_messages_authn_user_check CHECK (
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

CREATE INDEX IF NOT EXISTS ai_grading_messages_assessment_question_id_idx ON ai_grading_messages (assessment_question_id);

CREATE INDEX IF NOT EXISTS ai_grading_messages_workflow_run_id_idx ON ai_grading_messages (workflow_run_id);
