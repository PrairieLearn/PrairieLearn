-- BLOCK select_students
WITH
  course_users AS (
    SELECT
      u.*,
      e.*
    FROM
      enrollments AS e
      JOIN users AS u ON (u.user_id = e.user_id)
    WHERE
      e.course_instance_id = $course_instance_id
  )
SELECT
  ciu.*
FROM
  course_instance_users AS cu
ORDER BY
  cu.created_at;
