-- BLOCK select_log_job_sequences
SELECT
  to_jsonb(js) AS job_sequence,
  u.uid AS user_uid
FROM
  job_sequences AS js
  JOIN users AS u ON (u.id = js.user_id)
WHERE
  js.assessment_id = $assessment_id
  AND js.type = ANY ($job_types::text[])
ORDER BY
  js.start_date DESC,
  js.id ASC;
