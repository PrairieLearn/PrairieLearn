-- BLOCK select_job
WITH
  object_data AS (
    SELECT
      *
    FROM
      jobs
    WHERE
      course_id = $course_id
      AND job_sequence_id = $job_sequence_id
      AND type = 'sync'
  )
SELECT
  COALESCE(
    jsonb_agg(
      to_jsonb(object_data)
      ORDER BY
        job_sequence_id
    ),
    '[]'::jsonb
  ) AS item
FROM
  object_data;
