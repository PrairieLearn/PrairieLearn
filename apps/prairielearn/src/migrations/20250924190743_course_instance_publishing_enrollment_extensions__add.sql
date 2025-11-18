-- This table maps between a course instance publishing extension and an enrollment.
CREATE TABLE course_instance_publishing_extension_enrollments (
  id BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES enrollments ON DELETE CASCADE ON UPDATE CASCADE,
  course_instance_publishing_extension_id BIGINT NOT NULL REFERENCES course_instance_publishing_extensions ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (
    enrollment_id,
    course_instance_publishing_extension_id
  )
);

-- Quickly lookup all extensions for a given enrollment.
CREATE INDEX publishing_extension_enrollments_enrollment_id_idx ON course_instance_publishing_extension_enrollments (enrollment_id);

-- Quickly lookup all entries in this table for a given extension.
CREATE INDEX publishing_extension_enrollments_publishing_extension_id_idx ON course_instance_publishing_extension_enrollments (course_instance_publishing_extension_id);
