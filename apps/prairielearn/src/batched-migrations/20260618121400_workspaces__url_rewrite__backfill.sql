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
  -- Freeze URL rewrite behavior for all null workspace rows that exist when
  -- this batched migration is enqueued. Rows with an explicit question-level
  -- setting inherit that value; rows without one are set to TRUE to preserve
  -- the legacy default from before image labels were consulted. Workspaces
  -- created after this migration's captured ID range may remain NULL and will
  -- be resolved from image labels the next time they are started.
  url_rewrite = COALESCE(q.workspace_url_rewrite, TRUE)
FROM
  variants AS v
  JOIN questions AS q ON (q.id = v.question_id)
WHERE
  w.url_rewrite IS NULL
  AND w.id = v.workspace_id
  AND w.id >= $start
  AND w.id <= $end;
