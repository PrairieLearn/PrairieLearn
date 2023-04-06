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
  id
FROM
  batched_migrations
WHERE
  status = 'running'
  AND project = $project
ORDER BY
  id ASC
LIMIT
  1;
