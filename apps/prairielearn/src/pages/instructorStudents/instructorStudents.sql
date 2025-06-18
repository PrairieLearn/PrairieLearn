-- BLOCK select_students
WITH
  course_instance_users AS (
    SELECT
      u.uid,
      u.name,
      u.email,
      e.course_instance_id,
      e.created_at
    FROM
      enrollments AS e
      JOIN users AS u ON (u.user_id = e.user_id)
    WHERE
      e.course_instance_id = $course_instance_id
  )
SELECT
  ciu.*
FROM
  course_instance_users AS ciu
ORDER BY
  ciu.created_at;
