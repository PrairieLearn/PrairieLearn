-- BLOCK create_tables
CREATE TABLE grading_jobs (
  id bigint PRIMARY KEY,
  grading_request_canceled_at timestamptz,
  graded_at timestamptz
);

-- BLOCK insert_grading_job
INSERT INTO
  grading_jobs (id)
VALUES
  (1);

-- BLOCK cancel_grading_job
UPDATE grading_jobs
SET
  grading_request_canceled_at = now()
WHERE
  id = 1;

-- BLOCK has_waiting_grading_job
SELECT
  EXISTS (
    SELECT
      1
    FROM
      pg_locks
    WHERE
      locktype = 'advisory'
      AND NOT granted
      AND database = (
        SELECT
          oid
        FROM
          pg_database
        WHERE
          datname = current_database()
      )
  );
