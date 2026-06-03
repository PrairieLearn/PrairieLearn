-- BLOCK select_regrading_job_sequences
SELECT
  to_jsonb(js) AS job_sequence,
  u.uid AS user_uid
FROM
  job_sequences AS js
  JOIN courses AS c ON (c.id = js.course_id)
  JOIN users AS u ON (u.id = js.user_id)
WHERE
  js.assessment_id = $assessment_id
  AND (
    js.type = 'regrade_assessment'
    OR js.type = 'regrade_assessment_instance'
  )
ORDER BY
  js.start_date DESC,
  js.id ASC;

-- BLOCK select_upload_job_sequences
SELECT
  to_jsonb(js) AS job_sequence,
  u.uid AS user_uid
FROM
  job_sequences AS js
  JOIN courses AS c ON (c.id = js.course_id)
  JOIN users AS u ON (u.id = js.user_id)
WHERE
  js.assessment_id = $assessment_id
  AND js.type IN (
    'upload_instance_question_scores',
    'upload_assessment_instance_scores',
    'upload_submissions'
  )
ORDER BY
  js.start_date DESC,
  js.id ASC;
