-- BLOCK short_names
SELECT
  ci.short_name
FROM
  course_instances AS ci
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL;

-- BLOCK select_enrollment_count
SELECT
  COUNT(e.user_id)::integer AS enrollment_count
FROM
  enrollments AS e
WHERE
  e.course_instance_id = $course_instance_id
  AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id);
