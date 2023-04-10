-- BLOCK select_or_start_running_migration
WITH
  locked_migrations AS (
    SELECT
      *
    FROM
      batched_migrations
    WHERE
      project = $project
    FOR UPDATE
  ),
  running_migration AS (
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
      1
  ),
  updated_migration AS (
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
      AND NOT EXISTS (
        SELECT
          *
        FROM
          running_migration
      )
    RETURNING
      *
  )
SELECT
  *
FROM
  updated_migration
UNION ALL
SELECT
  *
FROM
  running_migration
LIMIT
  1;
