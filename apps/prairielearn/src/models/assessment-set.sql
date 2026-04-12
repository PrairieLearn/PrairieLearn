-- BLOCK select_assessment_set_by_id
SELECT
  *
FROM
  assessment_sets
WHERE
  id = $assessment_set_id;

-- BLOCK select_assessment_sets_for_course
SELECT
  aset.*
FROM
  assessment_sets AS aset
WHERE
  aset.course_id = $course_id;
