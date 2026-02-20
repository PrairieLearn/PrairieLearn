-- BLOCK select_lockpoint_exam
SELECT
  id
FROM
  assessments
WHERE
  uuid = '3d4ef390-5e04-4a7d-9dce-6cf8f5c17311';

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
