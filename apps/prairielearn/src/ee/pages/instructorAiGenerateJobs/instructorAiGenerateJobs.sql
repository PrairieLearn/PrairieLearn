-- BLOCK select_generation_sequence_by_course
SELECT
  to_jsonb(js.*) AS job_sequence,
  to_jsonb(u.*) AS user
FROM
  job_sequences AS js
  LEFT JOIN users AS u ON (js.authn_user_id = u.user_id)
WHERE
  js.course_id = $course_id
  AND js.type IN ('ai_question_generate', 'ai_question_regenerate')
ORDER BY
  js.start_date,
  js.id;
