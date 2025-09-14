-- BLOCK select_assessment
SELECT
  a.*
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  a.id = $assessment_id
  AND ci.id = $course_instance_id
  AND a.deleted_at IS NULL;

-- BLOCK select_assessment_id_from_uuid
SELECT
  a.id AS assessment_id
FROM
  assessments AS a
WHERE
  a.uuid = $uuid
  AND a.course_instance_id = $course_instance_id
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
