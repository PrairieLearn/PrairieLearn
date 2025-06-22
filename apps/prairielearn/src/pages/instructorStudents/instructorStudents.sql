-- BLOCK select_students
WITH
  course_instance_users AS (
    SELECT
      to_jsonb(u) AS user,
      to_jsonb(e) AS enrollment
    FROM
      enrollments AS e
      JOIN users AS u ON (u.user_id = e.user_id)
    WHERE
      e.course_instance_id = $course_instance_id
  )
SELECT
  ciu.enrollment,
  ciu.user
FROM
  course_instance_users AS ciu
ORDER BY
  ciu.created_at;
