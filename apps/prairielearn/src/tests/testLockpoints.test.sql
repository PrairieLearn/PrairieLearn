-- BLOCK select_lockpoint_zone_ids
SELECT
  id
FROM
  zones
WHERE
  assessment_id = $assessment_id
  AND lockpoint = true
ORDER BY
  number;

-- BLOCK select_assessment_instance_open
SELECT
  open
FROM
  assessment_instances
WHERE
  id = $assessment_instance_id;
