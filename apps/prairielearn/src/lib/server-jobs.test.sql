-- BLOCK insert_test_job_sequence
INSERT INTO
  job_sequences (number, type, description, legacy, status)
VALUES
  (
    1,
    'ai_grading',
    'test',
    FALSE,
    $status::enum_job_status
  )
RETURNING
  id;

-- BLOCK insert_test_job
INSERT INTO
  jobs (
    job_sequence_id,
    number_in_sequence,
    last_in_sequence,
    type,
    description,
    status,
    heartbeat_at
  )
VALUES
  (
    $job_sequence_id,
    1,
    TRUE,
    'ai_grading',
    'test',
    'Running',
    CURRENT_TIMESTAMP - INTERVAL '2 days'
  )
RETURNING
  id;

-- BLOCK select_status
SELECT
  status::text
FROM
  job_sequences
WHERE
  id = $job_sequence_id;

-- BLOCK select_job_status
SELECT
  status::text
FROM
  jobs
WHERE
  id = $job_id;

-- BLOCK force_old_start_date
UPDATE job_sequences
SET
  start_date = CURRENT_TIMESTAMP - INTERVAL '2 days'
WHERE
  id = $id;

-- BLOCK force_old_finish_date_with_status
UPDATE jobs
SET
  status = $status::enum_job_status,
  finish_date = CURRENT_TIMESTAMP - INTERVAL '2 days'
WHERE
  job_sequence_id = $id;

-- BLOCK mark_sequence_stopped
UPDATE job_sequences
SET
  status = 'Stopped'
WHERE
  id = $job_sequence_id;
