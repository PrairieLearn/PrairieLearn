-- BLOCK check_assessment_is_public
SELECT
  a.share_source_publicly
FROM
  assessments AS a
WHERE
  a.id = $assessment_id;

-- BLOCK select_assessment_by_id
SELECT
  *
FROM
  assessments
WHERE
  id = $assessment_id;

-- BLOCK select_assessment_info_for_job
SELECT
  aset.abbreviation || a.number AS assessment_label,
  ci.id AS course_instance_id,
  c.id AS course_id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
  a.id = $assessment_id;

-- BLOCK select_assessment_in_course_instance
SELECT
  *
FROM
  assessments
WHERE
  id = $unsafe_assessment_id
  AND course_instance_id = $course_instance_id
  AND deleted_at IS NULL;
