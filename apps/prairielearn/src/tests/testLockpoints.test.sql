-- BLOCK select_lockpoint_exam
SELECT
  id
FROM
  assessments
WHERE
  uuid = '3d4ef390-5e04-4a7d-9dce-6cf8f5c17311';

-- BLOCK select_lockpoint_advance_exam
SELECT
  id
FROM
  assessments
WHERE
  uuid = 'c6c9d4e0-cf20-4e8c-b6ed-29f6fd0f4a3e';

-- BLOCK select_lockpoint_homework
SELECT
  id
FROM
  assessments
WHERE
  uuid = '5cc9b27d-7068-4a08-ab17-5eaefe0f8d3b';

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
