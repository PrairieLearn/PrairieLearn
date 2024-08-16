-- BLOCK select_generation_sequence_by_course
SELECT
  to_jsonb(j.*) AS job,
  to_jsonb(u.*) AS user
FROM
  job_sequences AS j
  LEFT JOIN users AS u ON (j.authn_user_id = u.user_id)
WHERE
  j.course_id = $course_id
  AND (
    j.type = 'ai_question_generate'
    OR j.type = 'ai_question_regenerate'
  )
ORDER BY
  j.id;
