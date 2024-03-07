-- BLOCK insert_batched_migration
INSERT INTO
  batched_migrations (
    project,
    filename,
    timestamp,
    batch_size,
    min_value,
    max_value,
    status,
    started_at
  )
VALUES
  (
    $project,
    $filename,
    $timestamp,
    $batch_size,
    $min_value,
    $max_value,
    $status,
    -- If the migration is marked as already having succeeded, set `started_at`
    -- since the migration did technically start.
    CASE
      WHEN $status::enum_batched_migration_status = 'succeeded' THEN CURRENT_TIMESTAMP
      ELSE NULL
    END
  )
ON CONFLICT DO NOTHING
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
  AND id = $id;

-- BLOCK select_batched_migration_for_timestamp
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

-- BLOCK retry_failed_jobs
WITH
  updated_batched_migration AS (
    UPDATE batched_migrations
    SET
      status = 'running',
      started_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE
      project = $project
      AND id = $id
    RETURNING
      *
  )
UPDATE batched_migration_jobs
SET
  status = 'pending',
  started_at = NULL,
  finished_at = NULL,
  updated_at = CURRENT_TIMESTAMP
FROM
  updated_batched_migration
WHERE
  batched_migration_id = updated_batched_migration.id
  AND batched_migration_jobs.status = 'failed';
