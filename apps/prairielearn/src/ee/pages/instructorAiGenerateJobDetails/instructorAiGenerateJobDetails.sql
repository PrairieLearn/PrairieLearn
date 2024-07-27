-- BLOCK select_generation_job
SELECT
  j.*
FROM
  jobs AS j
WHERE
  j.course_id IS NOT DISTINCT FROM $course_id
  AND j.type = 'ai_question_generate'
  AND j.job_sequence_id = $job_sequence_id
ORDER BY
  j.number_in_sequence,
  j.id;
