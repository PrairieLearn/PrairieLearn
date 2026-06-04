-- BLOCK select_last_job_sequence
SELECT
  *
FROM
  job_sequences
ORDER BY
  start_date DESC
LIMIT
  1;
