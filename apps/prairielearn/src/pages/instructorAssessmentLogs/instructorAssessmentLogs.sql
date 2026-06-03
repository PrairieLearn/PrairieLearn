-- BLOCK select_log_job_sequences
SELECT
  to_jsonb(js) AS job_sequence,
  u.uid AS user_uid,
  CASE
    WHEN js.type IN (
      'regrade_assessment',
      'regrade_assessment_instance'
    ) THEN 'regrade'
    ELSE 'upload'
  END AS category
FROM
  job_sequences AS js
  JOIN users AS u ON (u.id = js.user_id)
WHERE
  js.assessment_id = $assessment_id
  AND js.type IN (
    'regrade_assessment',
    'regrade_assessment_instance',
    'upload_instance_question_scores',
    'upload_assessment_instance_scores',
    'upload_submissions'
  )
ORDER BY
  js.start_date DESC,
  js.id ASC;
