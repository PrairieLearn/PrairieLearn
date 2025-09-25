-- This table maps between a course instance access control extension and an enrollment.
CREATE TABLE course_instance_access_control_enrollment_extensions (
  id BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES enrollments ON DELETE CASCADE ON UPDATE CASCADE,
  course_instance_access_control_extension_id BIGINT NOT NULL REFERENCES course_instance_access_control_extensions ON DELETE CASCADE ON UPDATE CASCADE
  -- These records will be hard deleted when the enrollment is deleted.
);

-- Quickly lookup all extensions for a given enrollment.
CREATE INDEX course_instance_access_control_enrollment_extensions_enrollment_id_idx ON course_instance_access_control_enrollment_extensions (enrollment_id);

-- Quickly lookup all entries in this table for a given extension.
CREATE INDEX course_instance_access_control_enrollment_extensions_course_instance_access_control_extension_id_idx ON course_instance_access_control_enrollment_extensions (course_instance_access_control_extension_id);
