-- BLOCK select_last_job_sequence
SELECT
  *
FROM
  job_sequences
ORDER BY
  start_date DESC
LIMIT
  1;

-- BLOCK select_job_sequence
SELECT
  *
FROM
  job_sequences
WHERE
  id = $job_sequence_id;
