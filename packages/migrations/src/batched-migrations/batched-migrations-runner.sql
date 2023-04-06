-- BLOCK select_running_migration
SELECT
  *
FROM
  batched_migrations
WHERE
  status = 'running'
  AND project = $project
ORDER BY
  id ASC
LIMIT
  1;
