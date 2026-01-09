-- BLOCK select_enrollment_counts
SELECT
  ci.id AS course_instance_id,
  COUNT(e.user_id)::integer AS enrollment_count
FROM
  course_instances AS ci
  JOIN enrollments AS e ON (e.course_instance_id = ci.id)
WHERE
  ci.course_id = $course_id
  AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id)
GROUP BY
  ci.id;

-- BLOCK select_names
SELECT
  ci.short_name,
  ci.long_name
FROM
  course_instances AS ci
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL;
