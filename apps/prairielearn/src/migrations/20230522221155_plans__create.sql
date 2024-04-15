CREATE TYPE enum_plan_grant_type AS ENUM('trial', 'stripe', 'invoice', 'gift');

CREATE TABLE IF NOT EXISTS plan_grants (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plan_name TEXT NOT NULL,
  type enum_plan_grant_type NOT NULL,
  user_id BIGINT REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  institution_id BIGINT REFERENCES institutions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  course_instance_id BIGINT REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  enrollment_id BIGINT REFERENCES enrollments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT plan_grants_by_name_idx UNIQUE NULLS NOT DISTINCT (
    plan_name,
    institution_id,
    course_instance_id,
    enrollment_id
  )
);

CREATE TABLE IF NOT EXISTS course_instance_required_plans (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT REFERENCES course_instances (id),
  plan_name TEXT NOT NULL,
  UNIQUE (course_instance_id, plan_name)
);
