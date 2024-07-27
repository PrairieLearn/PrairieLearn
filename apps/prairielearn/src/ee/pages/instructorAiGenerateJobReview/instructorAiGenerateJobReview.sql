-- BLOCK select_generation_sequence_by_course
SELECT
  j.*
FROM
  jobs AS j
WHERE
  j.course_id IS NOT DISTINCT FROM $course_id
  AND j.type = 'ai_question_generate'
ORDER BY
  j.number_in_sequence,
  j.id;
