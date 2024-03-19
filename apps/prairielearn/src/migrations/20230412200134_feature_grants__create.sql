CREATE TYPE feature_grant_type AS ENUM('automatic', 'manual', 'subscription');

CREATE TABLE IF NOT EXISTS feature_grants (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type feature_grant_type NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  institution_id BIGINT REFERENCES institutions ON UPDATE CASCADE ON DELETE CASCADE,
  course_id BIGINT REFERENCES pl_courses ON UPDATE CASCADE ON DELETE CASCADE,
  course_instance_id BIGINT REFERENCES course_instances ON UPDATE CASCADE ON DELETE CASCADE,
  user_id BIGINT REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT feature_grants_by_name_idx UNIQUE (
    name,
    institution_id,
    course_id,
    course_instance_id,
    user_id,
    type
  )
);

-- Secondary index to allow looking up all feature flags for a given entity.
CREATE INDEX IF NOT EXISTS feature_grants_by_entity_idx ON feature_grants (
  institution_id,
  course_id,
  course_instance_id,
  user_id,
  name,
  type
);

-- Secondary index to allow looking up all feature flags for a given user.
CREATE INDEX IF NOT EXISTS feature_grants_user_id_name_type_idx ON feature_grants (user_id, name, type);

-- Secondary index to allow looking up all users with a given feature flag.
CREATE INDEX IF NOT EXISTS feature_grants_name_user_id_type_idx ON feature_grants (name, user_id, type);
