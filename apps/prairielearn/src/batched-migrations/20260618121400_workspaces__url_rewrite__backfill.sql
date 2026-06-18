-- BLOCK select_bounds
SELECT
  MIN(id) AS min,
  MAX(id) AS max
FROM
  workspaces
WHERE
  url_rewrite IS NULL;

-- BLOCK backfill_url_rewrite
UPDATE workspaces AS w
SET
  url_rewrite = q.workspace_url_rewrite
FROM
  variants AS v
  JOIN questions AS q ON (q.id = v.question_id)
WHERE
  w.url_rewrite IS NULL
  AND w.id = v.workspace_id
  AND w.id >= $start
  AND w.id <= $end;
