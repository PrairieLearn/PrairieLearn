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
ON CONFLICT DO NOTHING;

-- BLOCK enroll_invited_user_in_course_instance
UPDATE enrollments
SET
  status = 'joined',
  user_id = $user_id,
  pending_uid = NULL,
  first_joined_at = now()
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

-- BLOCK select_enrollment_for_user_in_course_instance_by_pending_uid
SELECT
  *
FROM
  enrollments
WHERE
  pending_uid = $pending_uid
  AND course_instance_id = $course_instance_id;

-- BLOCK select_enrollments_by_uids_in_course_instance
SELECT
  e.*
FROM
  enrollments AS e
  JOIN users AS u ON (u.user_id = e.user_id)
WHERE
  u.uid = ANY ($uids)
  AND e.course_instance_id = $course_instance_id;
