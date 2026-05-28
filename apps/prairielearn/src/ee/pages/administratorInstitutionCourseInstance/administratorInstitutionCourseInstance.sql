-- BLOCK update_enrollment_limit
UPDATE course_instances AS ci
SET
  enrollment_limit = $enrollment_limit
WHERE
  ci.id = $course_instance_id;
