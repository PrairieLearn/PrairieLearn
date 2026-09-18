CREATE TABLE IF NOT EXISTS course_instance_ai_grading_custom_endpoints (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  -- Stored as AES-encrypted ciphertext, not plaintext.
  encrypted_secret_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT course_instance_ai_grading_custom_endpoints_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT course_instance_ai_grading_custom_endpoints_ci_id_name_key UNIQUE (course_instance_id, name)
);

CREATE INDEX course_instance_ai_grading_custom_endpoints_ci_id_idx ON course_instance_ai_grading_custom_endpoints (course_instance_id);
