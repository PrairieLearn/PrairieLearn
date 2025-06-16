-- BLOCK select_students
WITH
  course_users AS (
    SELECT
      u.user_id,
      u.uid,
      u.uin,
      u.name AS user_name,
      u.email,
      e.id AS enrollment_id,
      e.created_at,
      CASE
        WHEN users_is_instructor_in_course_instance (u.user_id, e.course_instance_id) THEN 'Staff'
        WHEN e.id IS NOT NULL THEN 'Student'
        ELSE 'None'
      END AS role
    FROM
      enrollments AS e
      JOIN users AS u ON (u.user_id = e.user_id)
    WHERE
      e.course_instance_id = $course_instance_id
      AND u.deleted_at IS NULL
  )
SELECT
  cu.*
FROM
  course_users AS cu
ORDER BY
  cu.role DESC,
  cu.uid,
  cu.user_name,
  cu.user_id;
