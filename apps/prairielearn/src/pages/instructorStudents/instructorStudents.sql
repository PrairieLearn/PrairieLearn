-- BLOCK select_students
SELECT
  to_jsonb(u) AS user,
  to_jsonb(e) AS enrollment
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.user_id = e.user_id)
WHERE
  e.course_instance_id = $course_instance_id
ORDER BY
  u.uid ASC;

-- BLOCK select_enrollment_by_uid
SELECT
  to_jsonb(e) AS enrollment
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.user_id = e.user_id)
WHERE
  e.course_instance_id = $course_instance_id
  AND (
    e.pending_uid = $uid
    OR u.uid = $uid
  );

-- BLOCK upsert_enrollment_by_uid
INSERT INTO
  enrollments (course_instance_id, status, pending_uid)
VALUES
  ($course_instance_id, 'invited', $uid)
ON CONFLICT (course_instance_id, pending_uid) DO UPDATE
SET
  lti_managed = FALSE,
  pending_lti13_email = NULL,
  pending_lti13_instance_id = NULL,
  pending_lti13_name = NULL,
  pending_lti13_sub = NULL,
  pending_uid = $uid,
  status = 'invited',
  user_id = NULL
RETURNING
  *;
