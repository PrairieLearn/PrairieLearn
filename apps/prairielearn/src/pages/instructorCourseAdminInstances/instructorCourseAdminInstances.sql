-- BLOCK select_course_instance_id_from_uuid
SELECT
  ci.id AS course_instance_id
FROM
  course_instances AS ci
WHERE
  ci.uuid = $uuid
  AND ci.course_id = $course_id
  AND ci.deleted_at IS NULL;

-- BLOCK select_enrollment_counts
SELECT
  ci.id AS course_instance_id,
  COUNT(e.user_id) AS number
FROM
  course_instances AS ci
  JOIN enrollments AS e ON (e.course_instance_id = ci.id)
WHERE
  ci.course_id = $course_id
  AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id)
GROUP BY
  ci.id;
