-- BLOCK select_status
SELECT
  e.status
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.id = e.user_id)
WHERE
  e.course_instance_id = 1
  AND COALESCE(u.uid, e.pending_uid) = $uid;
