-- BLOCK select_users_and_enrollments_for_course_instance
SELECT
  to_jsonb(u) AS user,
  to_jsonb(e) AS enrollment
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.id = e.user_id)
WHERE
  e.course_instance_id = $course_instance_id
ORDER BY
  COALESCE(u.uid, e.pending_uid) ASC;
