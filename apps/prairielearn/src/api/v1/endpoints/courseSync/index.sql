-- BLOCK select_job_status
SELECT
  *
FROM
  jobs
WHERE
  course_id = $course_id
  AND job_sequence_id = $job_sequence_id;
