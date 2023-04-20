-- BLOCK select_recent_jobs_with_status
SELECT
  *
FROM
  batched_migration_jobs
WHERE
  batched_migration_id = $batched_migration_id
  AND status = $status
ORDER BY
  max_value DESC
LIMIT
  $limit;
