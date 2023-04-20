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

-- BLOCK start_batched_migration_job
UPDATE batched_migration_jobs
SET
  attempts = attempts + 1,
  updated_at = CURRENT_TIMESTAMP,
  started_at = CURRENT_TIMESTAMP
WHERE
  id = $id;

-- BLOCK finish_batched_migration_job
UPDATE batched_migration_jobs
SET
  status = $status::enum_batched_migration_job_status,
  updated_at = CURRENT_TIMESTAMP,
  finished_at = CURRENT_TIMESTAMP,
  data = $data
WHERE
  id = $id;

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
      AND status = 'pending'
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

-- BLOCK get_migration_status
SELECT
  status
FROM
  batched_migrations
WHERE
  id = $id;
