-- BLOCK select_assessment_modules_for_course
SELECT
  am.*
FROM
  assessment_modules AS am
WHERE
  am.course_id = $course_id;
