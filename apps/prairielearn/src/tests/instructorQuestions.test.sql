-- BLOCK select_questions
SELECT
  *
FROM
  questions;

-- BLOCK select_job_sequence
SELECT
  *
FROM
  job_sequences
WHERE
  id = $job_sequence_id;
