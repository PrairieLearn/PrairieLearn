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

-- BLOCK select_jobs
SELECT
  j.*
FROM
  jobs AS j
  JOIN job_sequences AS js ON (js.id = j.job_sequence_id)
WHERE
  js.id = $job_sequence_id
ORDER BY
  j.number_in_sequence;
