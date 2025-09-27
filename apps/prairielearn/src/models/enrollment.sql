-- BLOCK ensure_enrollment
INSERT INTO
  enrollments (
    user_id,
    course_instance_id,
    status,
    first_joined_at
  )
VALUES
  ($user_id, $course_instance_id, 'joined', now())
ON CONFLICT DO NOTHING
RETURNING
  *;

-- BLOCK enroll_user
UPDATE enrollments
SET
  status = 'joined',
  user_id = $user_id,
  pending_uid = NULL,
  first_joined_at = COALESCE(first_joined_at, now())
WHERE
  id = $enrollment_id
RETURNING
  *;

-- BLOCK select_enrollment_by_pending_uid
SELECT
  *
FROM
  enrollments
WHERE
  pending_uid = $pending_uid
  AND course_instance_id = $course_instance_id;

-- BLOCK select_enrollment_by_user_id
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

-- BLOCK invite_existing_enrollment
UPDATE enrollments
SET
  status = 'invited',
  user_id = NULL,
  pending_uid = $pending_uid
WHERE
  id = $enrollment_id
RETURNING
  *;

-- BLOCK select_enrollments_by_uids_in_course_instance
SELECT
  e.*
FROM
  enrollments AS e
  JOIN users AS u ON (u.user_id = e.user_id)
WHERE
  u.uid = ANY ($uids)
  AND e.course_instance_id = $course_instance_id;


-- BLOCK invite_new_enrollment
INSERT INTO
  enrollments (course_instance_id, status, pending_uid)
VALUES
  ($course_instance_id, 'invited', $pending_uid)
RETURNING
  *;

-- BLOCK select_and_lock_enrollment_by_id
SELECT
  *
FROM
  enrollments
WHERE
  id = $id
FOR NO KEY UPDATE;
