CREATE TYPE enum_course_instance_usages_type AS ENUM(
  -- The user made at least one submission.
  'Submission',
  -- Total compute time in external grading.
  'External grading',
  -- Total compute time in workspaces.
  'Workspace'
);

CREATE TABLE course_instance_usages (
  id BIGSERIAL PRIMARY KEY,
  type enum_course_instance_usages_type NOT NULL,
  institution_id BIGINT NOT NULL REFERENCES institutions (id),
  course_id BIGINT NOT NULL REFERENCES pl_courses (id),
  course_instance_id BIGINT REFERENCES course_instances (id),
  date TIMESTAMPTZ NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users (user_id),
  include_in_statistics BOOLEAN NOT NULL,
  duration INTERVAL NOT NULL DEFAULT '0',
  UNIQUE NULLS NOT DISTINCT (
    type,
    course_id,
    course_instance_id,
    date,
    user_id
  )
);

CREATE INDEX course_instance_usages_date_idx ON course_instance_usages (date);

CREATE INDEX course_instance_usages_institution_id_date_idx ON course_instance_usages (institution_id, date);
