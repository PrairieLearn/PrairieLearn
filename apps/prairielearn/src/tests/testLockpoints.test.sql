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
