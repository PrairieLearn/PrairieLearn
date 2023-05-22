CREATE TYPE enum_plan_grant_type AS ENUM('trial', 'stripe', 'invoice', 'gift');

CREATE TABLE IF NOT EXISTS
  plan_grants (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    plan_name TEXT NOT NULL,
    type enum_plan_grant_type NOT NULL,
    enrollment_limit INTEGER DEFAULT NULL,
    -- TODO: why do we actually need a user_id here?
    user_id BIGINT REFERENCES users (user_id),
    institution_id BIGINT REFERENCES institutions (id),
    course_instance_id BIGINT REFERENCES course_instances (id),
    enrollment_id BIGINT REFERENCES enrollments (id)
  );

CREATE TABLE IF NOT EXISTS
  course_instances_required_plans (
    id BIGSERIAL PRIMARY KEY,
    course_instance_id BIGINT REFERENCES course_instances (id),
    plan_name TEXT NOT NULL
  );
