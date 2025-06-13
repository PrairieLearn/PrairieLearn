-- BLOCK select_job
WITH
  object_data AS (
    SELECT
      job_sequence_id,
      start_date,
      finish_date,
      status,
      output
    FROM
      jobs
    WHERE
      course_id = $course_id
      AND job_sequence_id = $job_sequence_id
      AND type = 'sync'
  )
SELECT
  to_jsonb(object_data) AS item
FROM
  object_data;
