-- BLOCK select_users_and_enrollments_for_course_instance
SELECT
  to_jsonb(u) AS user,
  to_jsonb(e) AS enrollment,
  CASE
    WHEN u.id IS NOT NULL THEN users_get_displayed_role (u.id, e.course_instance_id)
    ELSE 'None'
  END AS role
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.id = e.user_id)
WHERE
  e.course_instance_id = $course_instance_id
ORDER BY
  COALESCE(u.uid, e.pending_uid) ASC;
