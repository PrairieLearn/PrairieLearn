-- BLOCK tids
SELECT
  a.tid
FROM
  assessments AS a
WHERE
  a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL;

-- BLOCK select_assessment_sets
SELECT
  aset.*
FROM
  assessment_sets AS aset
WHERE
  aset.course_id = $course_id;

-- BLOCK select_assessment_modules
SELECT
  am.*
FROM
  assessment_modules AS am
WHERE
  am.course_id = $course_id;
