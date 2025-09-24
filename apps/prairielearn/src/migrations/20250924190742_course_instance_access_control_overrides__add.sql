CREATE TABLE course_instance_access_control_overrides (
    id BIGSERIAL PRIMARY KEY,
    course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    name TEXT,
    published_end_date TIMESTAMP WITH TIME ZONE
    -- These records will be hard deleted.
);

-- Quickly lookup all overrides for a given course instance.
CREATE INDEX course_instance_access_control_overrides_course_instance_id_idx ON course_instance_access_control_overrides (course_instance_id);

-- Ensure names are unique within each course instance.
ALTER TABLE course_instance_access_control_overrides
ADD CONSTRAINT course_instance_access_control_overrides_course_instance_id_name_unique
UNIQUE (course_instance_id, name);
