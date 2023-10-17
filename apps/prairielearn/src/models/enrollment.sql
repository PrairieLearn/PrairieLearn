-- BLOCK ensure_enrollment
WITH
  new_enrollment AS (
    INSERT INTO
      enrollments (user_id, course_instance_id)
    VALUES
      ($user_id, $course_instance_id)
    ON CONFLICT DO NOTHING
    RETURNING
      *
  )
SELECT
  *
FROM
  new_enrollment
UNION ALL
SELECT
  *
FROM
  enrollments
WHERE
  user_id = $user_id
  AND course_instance_id = $course_instance_id;

-- BLOCK select_enrollment_for_user_in_course_instance
SELECT
  *
FROM
  enrollments
WHERE
  user_id = $user_id
  AND course_instance_id = $course_instance_id;
