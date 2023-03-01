-- BLOCK select_questions
SELECT
  *
FROM
  questions;

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

-- BLOCK select_issues_for_last_variant
WITH
  last_variant AS (
    SELECT
      *
    FROM
      variants
    ORDER BY
      date DESC
    LIMIT
      1
  )
SELECT
  *
FROM
  issues,
  last_variant
WHERE
  variant_id = last_variant.id;
