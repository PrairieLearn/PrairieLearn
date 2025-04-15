-- BLOCK select_assessment_modules
SELECT
  am.*
FROM
  assessment_modules AS am
WHERE
  am.course_id = $course_id
ORDER BY
  am.number;
