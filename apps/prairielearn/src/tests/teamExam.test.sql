-- BLOCK select_team_exam_by_tid
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.tid = $assessment_tid;

-- BLOCK select_team_config
SELECT
  minimum,
  maximum
FROM
  team_configs
WHERE
  assessment_id = $assessment_id
  AND deleted_at IS NULL;

-- BLOCK select_all_assessment_instance
SELECT
  ai.*
FROM
  assessment_instances AS ai;
