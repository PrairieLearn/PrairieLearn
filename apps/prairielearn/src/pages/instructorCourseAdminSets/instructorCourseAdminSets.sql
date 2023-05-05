-- BLOCK select_assessment_sets
SELECT
  aset.*
FROM
  assessment_sets AS aset
WHERE
  aset.course_id = $course_id
ORDER BY
  aset.number;
