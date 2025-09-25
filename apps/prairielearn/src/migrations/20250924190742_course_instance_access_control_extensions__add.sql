CREATE TABLE course_instance_access_control_extensions (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  name TEXT,
  published_end_date TIMESTAMP WITH TIME ZONE NOT NULL
  -- These records will be hard deleted.
);

-- Quickly lookup all extensions for a given course instance.
CREATE INDEX course_instance_access_control_extensions_course_instance_id_idx ON course_instance_access_control_extensions (course_instance_id);

-- Ensure names are unique within each course instance.
ALTER TABLE course_instance_access_control_extensions
ADD CONSTRAINT course_instance_access_control_extensions_course_instance_id_name_unique UNIQUE (course_instance_id, name);
