-- BLOCK update_course_instance_settings
UPDATE course_instances
SET
  self_enrollment_enabled = $self_enrollment_enabled,
  self_enrollment_restrict_to_institution = $restrict_to_institution,
  self_enrollment_use_enrollment_code = $self_enrollment_use_enrollment_code
WHERE
  id = $course_instance_id;

-- BLOCK create_institution
INSERT INTO
  institutions (id, short_name, long_name, uid_regexp)
VALUES
  ($id, $short_name, $long_name, $uid_regexp)
ON CONFLICT (id) DO NOTHING
RETURNING
  *;

-- BLOCK delete_enrollments_in_course_instance
DELETE FROM enrollments
WHERE
  course_instance_id = $course_instance_id;
