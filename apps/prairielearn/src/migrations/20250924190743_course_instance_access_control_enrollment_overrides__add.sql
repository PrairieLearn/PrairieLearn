-- This table maps between enrollments and course instance access control overrides for 'individual' overrides.
CREATE TABLE course_instance_access_control_enrollment_overrides (
    id BIGSERIAL PRIMARY KEY,
    enrollment_id BIGINT NOT NULL REFERENCES enrollments ON DELETE CASCADE ON UPDATE CASCADE,
    course_instance_access_control_override_id BIGINT NOT NULL REFERENCES course_instance_access_control_overrides ON DELETE CASCADE ON UPDATE CASCADE
    -- These records will be hard deleted when the enrollment is deleted.
);

-- Quickly lookup all overrides for a given enrollment.
CREATE INDEX course_instance_access_control_enrollment_overrides_enrollment_id_idx ON course_instance_access_control_enrollment_overrides (enrollment_id);

-- Quickly lookup all entries in this table for a given override.
CREATE INDEX course_instance_access_control_enrollment_overrides_course_instance_access_control_override_id_idx ON course_instance_access_control_enrollment_overrides (course_instance_access_control_override_id);
