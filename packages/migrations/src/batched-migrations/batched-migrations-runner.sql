-- BLOCK select_all_batched_migrations
SELECT
  *
FROM
  batched_migrations
WHERE
  project = $project
ORDER BY
  id ASC;

-- BLOCK insert_batched_migration
INSERT INTO
  batched_migrations (
    project,
    name,
    timestamp,
    batch_size,
    min_value,
    max_value
  )
VALUES
  (
    $project,
    $name,
    $timestamp,
    $batch_size,
    $min_value,
    $max_value
  );

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

-- BLOCK select_last_batched_migration_job
SELECT
  *
FROM
  batched_migration_jobs
WHERE
  batched_migration_id = $batched_migration_id
ORDER BY
  id DESC
LIMIT
  1;

-- BLOCK insert_batched_migration_job
INSERT INTO
  batched_migration_jobs (
    batched_migration_id,
    status,
    min_value,
    max_value
  )
VALUES
  (
    $batched_migration_id,
    'pending'::enum_batched_migration_job_status,
    $min_value,
    $max_value
  )
RETURNING
  *;

-- BLOCK select_first_pending_batched_migration_job
SELECT
  *
FROM
  batched_migration_jobs
WHERE
  batched_migration_id = $batched_migration_id
  AND status = 'pending'
ORDER BY
  id ASC
LIMIT
  1;

-- BLOCK batched_migration_has_incomplete_jobs
SELECT
  EXISTS (
    SELECT
      1
    FROM
      batched_migration_jobs
    WHERE
      batched_migration_id = $batched_migration_id
      AND status IN ('pending', 'running')
  ) as exists;

-- BLOCK batched_migration_has_failed_jobs
SELECT
  EXISTS (
    SELECT
      1
    FROM
      batched_migration_jobs
    WHERE
      batched_migration_id = $batched_migration_id
      AND status = 'failed'
  ) as exists;
