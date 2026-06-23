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
  -- All workspaces being backfilled were created before the label was used, so
  -- they relied on the default value of TRUE for url_rewrite. Workspaces
  -- created between the column addition and the label introduction (i.e., not
  -- included in this backfill) may still have a null url_rewrite value, but
  -- they will be set with a suitable value the next time they are started.
  url_rewrite = COALESCE(q.workspace_url_rewrite, TRUE)
FROM
  variants AS v
  JOIN questions AS q ON (q.id = v.question_id)
WHERE
  w.url_rewrite IS NULL
  AND w.id = v.workspace_id
  AND w.id >= $start
  AND w.id <= $end;
