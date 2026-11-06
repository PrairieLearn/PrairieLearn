-- BLOCK select_course_counts
SELECT
  (
    SELECT
      count(*)::integer
    FROM
      questions
    WHERE
      course_id = $course_id
      AND deleted_at IS NULL
  ) AS questions,
  (
    SELECT
      count(*)::integer
    FROM
      assessments AS a
      JOIN course_instances AS ci ON ci.id = a.course_instance_id
    WHERE
      ci.course_id = $course_id
      AND ci.deleted_at IS NULL
      AND a.deleted_at IS NULL
  ) AS assessments;

-- BLOCK select_job_output
SELECT
  output
FROM
  jobs
WHERE
  job_sequence_id = $job_sequence_id
ORDER BY
  number_in_sequence;
