-- BLOCK course_instance_enrollment_count
SELECT
  COUNT(*)::integer AS count
FROM
  enrollments
WHERE
  course_instance_id = $course_instance_id;

-- BLOCK update_course_instance_billing
UPDATE course_instances
SET
  student_billing_enabled = $student_billing_enabled
WHERE
  id = $course_instance_id;
