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

-- BLOCK start_next_pending_migration
UPDATE batched_migrations
SET
  status = 'running',
  started_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = (
    SELECT
      id
    FROM
      batched_migrations
    WHERE
      status = 'pending'
      AND project = $project
    ORDER BY
      id ASC
    LIMIT
      1
  )
RETURNING
  *;
