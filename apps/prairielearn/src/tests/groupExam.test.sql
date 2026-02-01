-- BLOCK select_group_config
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
