-- BLOCK select_enrollment_for_user_in_course_instance
SELECT
  *
FROM
  enrollments
WHERE
  user_id = $user_id
  AND course_instance_id = $course_instance_id;

-- BLOCK old_ensure_enrollment
INSERT INTO
  enrollments (user_id, course_instance_id, status)
VALUES
  ($user_id, $course_instance_id, 'joined')
ON CONFLICT DO NOTHING;
