-- BLOCK select_max_id
SELECT
  max(id)
FROM
  assessment_instances;

-- BLOCK select_and_lock_batch
SELECT
  ai.id
FROM
  assessment_instances AS ai
WHERE
  ai.id BETWEEN $start AND $end
ORDER BY
  ai.id
FOR NO KEY UPDATE OF
  ai;
