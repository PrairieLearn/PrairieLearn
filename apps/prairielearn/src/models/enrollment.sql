-- BLOCK ensure_enrollment
INSERT INTO
  enrollments (user_id, course_instance_id, status, joined_at, first_joined_at)
VALUES
  ($user_id, $course_instance_id, 'joined', now(), now())
ON CONFLICT DO NOTHING;

-- BLOCK enroll_invited_user_in_course_instance
UPDATE enrollments
SET
  status = 'joined',
  user_id = $user_id,
  pending_uid = NULL,
  joined_at = now(),
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
