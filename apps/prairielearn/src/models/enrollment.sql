-- BLOCK ensure_enrollment
INSERT INTO
  enrollments (user_id, course_instance_id, status, joined_at)
VALUES
  ($user_id, $course_instance_id, 'joined', now())
ON CONFLICT DO NOTHING
RETURNING
  *;

-- BLOCK enroll_invited_user_in_course_instance
UPDATE enrollments
SET
  status = 'joined',
  user_id = $user_id,
  pending_uid = NULL,
  joined_at = now()
WHERE
  pending_uid = $pending_uid
  AND course_instance_id = $course_instance_id
  AND status = 'invited';

-- BLOCK select_enrollment_for_user_in_course_instance
SELECT
  *
FROM
  enrollments
WHERE
  user_id = $user_id
  AND course_instance_id = $course_instance_id;

-- BLOCK select_enrollment_by_id
SELECT
  *
FROM
  enrollments
WHERE
  id = $id;

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

-- BLOCK upsert_enrollment_invitation_by_uid
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

-- BLOCK enroll_invited_user_in_course_instance
UPDATE enrollments
SET
  status = 'joined',
  user_id = $user_id,
  pending_uid = NULL,
  joined_at = now()
WHERE
  pending_uid = $pending_uid
  AND course_instance_id = $course_instance_id
  AND status = 'invited'
RETURNING
  *;
