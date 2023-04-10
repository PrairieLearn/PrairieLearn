-- BLOCK insert_batched_migration
INSERT INTO
  batched_migrations (
    project,
    filename,
    timestamp,
    batch_size,
    min_value,
    max_value,
    status
  )
VALUES
  (
    $project,
    $filename,
    $timestamp,
    $batch_size,
    $min_value,
    $max_value,
    $status
  )
RETURNING
  *;

-- BLOCK select_all_batched_migrations
SELECT
  *
FROM
  batched_migrations
WHERE
  project = $project
ORDER BY
  id ASC;

-- BLOCK select_batched_migration
SELECT
  *
FROM
  batched_migrations
WHERE
  project = $project
  AND timestamp = $timestamp;

-- BLOCK update_batched_migration_status
UPDATE batched_migrations
SET
  status = $status,
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = $id
RETURNING
  *;
