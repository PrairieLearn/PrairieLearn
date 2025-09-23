CREATE TABLE instance_groups (
  id BIGSERIAL PRIMARY KEY,
  -- This also creates an index to lookup instance_groups for a course instance.
  course_instance_id BIGINT NOT NULL REFERENCES course_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  deleted_at TIMESTAMP,
  -- The name of the instance group must be unique within the course instance.
  UNIQUE (course_instance_id, name)
);
