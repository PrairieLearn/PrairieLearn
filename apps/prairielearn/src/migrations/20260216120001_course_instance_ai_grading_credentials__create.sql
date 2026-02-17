CREATE TYPE enum_ai_grading_provider AS ENUM('openai', 'google', 'anthropic');

CREATE TABLE IF NOT EXISTS course_instance_ai_grading_credentials (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  provider enum_ai_grading_provider NOT NULL,
  -- Stored as AES-encrypted ciphertext, not plaintext.
  encrypted_secret_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ci_ai_grading_credentials_ci_id_provider_key UNIQUE (course_instance_id, provider)
);

CREATE INDEX IF NOT EXISTS course_instance_ai_grading_credentials_ci_id_idx ON course_instance_ai_grading_credentials (course_instance_id);
