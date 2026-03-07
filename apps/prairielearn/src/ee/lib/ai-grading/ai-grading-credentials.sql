-- BLOCK select_credentials_for_course_instance
SELECT
  *
FROM
  course_instance_ai_grading_credentials
WHERE
  course_instance_id = $course_instance_id;
