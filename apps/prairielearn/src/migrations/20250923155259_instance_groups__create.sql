CREATE TABLE instance_groups (
  id BIGSERIAL PRIMARY KEY,
  -- This also creates an index to lookup instance_groups for a course instance.
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  name TEXT NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- The name of the instance group must be unique within the course instance, but only for non-deleted groups.
CREATE UNIQUE INDEX instance_groups_course_instance_id_name_unique ON instance_groups (course_instance_id, name)
WHERE
  deleted_at IS NULL;
