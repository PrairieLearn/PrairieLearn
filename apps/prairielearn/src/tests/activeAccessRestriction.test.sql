-- BLOCK count_variants
SELECT
  COUNT(v.*)::integer
FROM
  variants AS v
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  ai.id = $assessment_instance_id;

-- BLOCK read_assessment_instance_points
SELECT
  ai.points
FROM
  assessment_instances AS ai
WHERE
  ai.assessment_id = $assessment_id;

-- BLOCK get_attached_files
SELECT
  COUNT(*)::integer
FROM
  files
WHERE
  files.assessment_id = $assessment_id;

-- BLOCK select_assessment_instances
SELECT
  *
FROM
  assessment_instances;
