-- BLOCK ensure_enrollment
INSERT INTO
  enrollments (user_id, course_instance_id)
VALUES
  ($user_id, $course_instance_id)
ON CONFLICT DO NOTHING;

-- BLOCK select_enrollment_for_user_in_course_instance
SELECT
  *
FROM
  enrollments
WHERE
  user_id = $user_id
  AND course_instance_id = $course_instance_id;
