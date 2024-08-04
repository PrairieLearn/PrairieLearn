-- BLOCK select_generation_job
SELECT
  j.*
FROM
  jobs AS j
WHERE
  j.course_id = $course_id
  AND (
    j.type = 'ai_question_generate'
    OR j.type = 'ai_question_regen'
  )
  AND j.job_sequence_id = $job_sequence_id
ORDER BY
  j.number_in_sequence,
  j.id;
