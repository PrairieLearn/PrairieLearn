-- BLOCK select_joined_course_instances
SELECT
  ci.id AS course_instance_id,
  ci.short_name AS course_instance_short_name,
  ci.long_name AS course_instance_long_name,
  ci.course_id AS course_instance_course_id,
  ci.display_timezone,
  c.short_name AS course_short_name,
  c.title AS course_title
FROM
  enrollments AS e
  JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
  JOIN courses AS c ON (c.id = ci.course_id)
WHERE
  e.user_id = $user_id
  AND e.status = 'joined'
  AND ci.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND c.example_course IS FALSE
ORDER BY
  ci.id;
