-- BLOCK select_load_test_course_instance
SELECT
  ci.id AS course_instance_id,
  EXISTS (
    SELECT
      1
    FROM
      enrollments AS e
    WHERE
      e.user_id = $user_id
      AND e.course_instance_id = ci.id
      AND e.status = 'joined'
  ) AS has_joined_enrollment
FROM
  course_instances AS ci
  JOIN courses AS c ON (c.id = ci.course_id)
WHERE
  c.example_course IS TRUE
  AND c.deleted_at IS NULL
  AND ci.deleted_at IS NULL;
