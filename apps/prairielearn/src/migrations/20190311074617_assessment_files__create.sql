CREATE TABLE files (
  id bigserial PRIMARY KEY,
  user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_id BIGINT REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_instance_id BIGINT REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
  instance_question_id BIGINT REFERENCES instance_questions ON DELETE CASCADE ON UPDATE CASCADE,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  created_by BIGINT REFERENCES users ON DELETE SET NULL ON UPDATE CASCADE,
  deleted_at timestamptz,
  deleted_by BIGINT REFERENCES users ON DELETE SET NULL ON UPDATE CASCADE,
  display_filename text NOT NULL,
  storage_filename text NOT NULL UNIQUE,
  type text NOT NULL
);

CREATE INDEX files_assessment_id_user_id_idx ON files (assessment_id, user_id);

CREATE INDEX files_assessment_instance_id_idx ON files (assessment_instance_id);

CREATE INDEX files_instance_question_id_idx ON files (instance_question_id);
