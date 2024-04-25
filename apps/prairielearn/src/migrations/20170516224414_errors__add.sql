CREATE TABLE IF NOT EXISTS errors (
  id BIGSERIAL,
  display_id TEXT,
  date TIMESTAMPTZ,
  course_caused BOOLEAN,
  message text,
  course_data jsonb,
  system_data jsonb,
  course_id BIGINT REFERENCES pl_courses ON DELETE SET NULL ON UPDATE CASCADE,
  course_instance_id BIGINT REFERENCES course_instances ON DELETE SET NULL ON UPDATE CASCADE,
  question_id BIGINT REFERENCES questions ON DELETE SET NULL ON UPDATE CASCADE,
  assessment_id BIGINT REFERENCES assessments ON DELETE SET NULL ON UPDATE CASCADE,
  authn_user_id BIGINT REFERENCES users ON DELETE SET NULL ON UPDATE CASCADE,
  user_id BIGINT REFERENCES users ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS errors_course_id_idx ON errors (course_id);

CREATE INDEX IF NOT EXISTS errors_course_instance_id_idx ON errors (course_instance_id);

CREATE INDEX IF NOT EXISTS errors_question_id_idx ON errors (question_id);

CREATE INDEX IF NOT EXISTS errors_assessment_id_idx ON errors (assessment_id);

CREATE INDEX IF NOT EXISTS errors_authn_user_id_idx ON errors (authn_user_id);

CREATE INDEX IF NOT EXISTS errors_user_id_idx ON errors (user_id);
