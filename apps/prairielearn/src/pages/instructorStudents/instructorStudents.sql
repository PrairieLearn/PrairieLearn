-- BLOCK select_students
SELECT
  to_jsonb(u) AS user,
  to_jsonb(e) AS enrollment
FROM
  enrollments AS e
  JOIN users AS u ON (u.user_id = e.user_id)
WHERE
  e.course_instance_id = $course_instance_id
ORDER BY
  u.uid ASC;

-- BLOCK insert_invite_by_uid
INSERT INTO enrollments (course_instance_id, status, pending_uid)
VALUES ($course_instance_id, 'invited', $uid);
