-- BLOCK select_assessment_in_course_instance
SELECT
  *
FROM
  assessments
WHERE
  id = $unsafe_assessment_id
  AND course_instance_id = $course_instance_id
  AND deleted_at IS NULL;
