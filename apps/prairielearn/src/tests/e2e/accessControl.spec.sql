-- BLOCK select_access_controls
SELECT
  *
FROM
  assessment_access_control
WHERE
  assessment_id = $assessment_id
ORDER BY
  number;
