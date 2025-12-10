CREATE TABLE student_groups (
  id BIGSERIAL PRIMARY KEY,
  -- This also creates an index to lookup student_groups for a course instance.
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  name TEXT NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- The name of the student group must be unique within the course instance, but only for non-deleted groups.
CREATE UNIQUE INDEX student_groups_course_instance_id_name_unique ON student_groups (course_instance_id, name)
WHERE
  deleted_at IS NULL;

-- This table is used to track which enrollments (enrolled users) are members of a given student group.
CREATE TABLE student_group_enrollments (
  id BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES enrollments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  student_group_id BIGINT NOT NULL REFERENCES student_groups (id) ON UPDATE CASCADE ON DELETE CASCADE,
  -- Entries in this table are hard-deleted.
  UNIQUE (enrollment_id, student_group_id)
);

-- This index is used to quickly find all enrollments that are members of a given student group.
CREATE INDEX student_group_enrollments_student_group_id_key ON student_group_enrollments (student_group_id);
