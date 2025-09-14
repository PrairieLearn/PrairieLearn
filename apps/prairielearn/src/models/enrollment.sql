-- BLOCK ensure_enrollment
INSERT INTO
  enrollments (user_id, course_instance_id, status, joined_at)
VALUES
  ($user_id, $course_instance_id, 'joined', now())
ON CONFLICT DO NOTHING
RETURNING
  *;

-- BLOCK select_enrollment_for_user_in_course_instance
SELECT
  *
FROM
  enrollments
WHERE
  user_id = $user_id
  AND course_instance_id = $course_instance_id;
