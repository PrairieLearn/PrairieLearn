CREATE TABLE IF NOT EXISTS
  feature_flag_grants (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    institution_id BIGINT REFERENCES institutions ON UPDATE CASCADE ON DELETE CASCADE,
    course_id BIGINT REFERENCES courses ON UPDATE CASCADE ON DELETE CASCADE,
    course_instance_id BIGINT REFERENCES course_instances ON UPDATE CASCADE ON DELETE CASCADE,
    user_id BIGINT REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE (
      name,
      institution_id,
      course_id,
      course_instance_id,
      user_id
    )
  );

CREATE INDEX IF NOT EXISTS feature_flag_grants_user_id ON feature_flag_grants (user_id);
