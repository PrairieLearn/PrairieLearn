-- BLOCK select_student_info
SELECT
  to_jsonb(u.*) AS user,
  to_jsonb(ci.*) AS course_instance,
  to_jsonb(e.*) AS enrollment,
  users_get_displayed_role (u.user_id, $course_instance_id) AS role
FROM
  users AS u
  JOIN course_instances AS ci ON (ci.id = $course_instance_id)
  LEFT JOIN enrollments AS e ON (
    e.user_id = u.user_id
    AND e.course_instance_id = $course_instance_id
  )
WHERE
  u.user_id = $user_id
  AND (
    -- Student must be enrolled or have staff permissions
    e.id IS NOT NULL
    OR users_is_instructor_in_course_instance (u.user_id, $course_instance_id)
  );
