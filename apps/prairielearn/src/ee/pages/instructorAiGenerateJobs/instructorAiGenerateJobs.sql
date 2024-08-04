-- BLOCK select_generation_sequence_by_course
SELECT
  j.*,
  u.email
FROM
  jobs AS j
  LEFT JOIN users AS u ON (j.authn_user_id = u.user_id)
WHERE
  j.course_id = $course_id
  AND (
    j.type = 'ai_question_generate'
    OR j.type = 'ai_question_regen'
  )
ORDER BY
  j.number_in_sequence,
  j.id;
