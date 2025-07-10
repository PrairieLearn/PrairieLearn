-- BLOCK select_student_info
SELECT
  -- TODO: validate this query looks reasonable
  to_jsonb(u.*) AS user,
  users_get_displayed_role(u.user_id, $course_instance_id) AS role,
  format_date_iso8601(e.created_at, ci.display_timezone) AS enrollment_date
FROM
  users AS u
  JOIN course_instances AS ci ON (ci.id = $course_instance_id)
  LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = $course_instance_id)
WHERE
  u.user_id = $user_id
  AND (
    -- Student must be enrolled or have staff permissions
    e.id IS NOT NULL
    OR users_is_instructor_in_course_instance(u.user_id, $course_instance_id)
  );

