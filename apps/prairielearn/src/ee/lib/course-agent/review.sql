-- BLOCK select_pending_deliveries
SELECT
  to_jsonb(j.*) AS job,
  to_jsonb(c.*) AS course
FROM
  jobs AS j
  JOIN job_sequences AS js ON js.id = j.job_sequence_id
  JOIN courses AS c ON c.id = js.course_id
  AND c.deleted_at IS NULL
WHERE
  js.type = 'course_agent_push_sync'
  AND j.status != 'Running'
  AND j.data ->> 'callbackDelivered' = 'false';

-- BLOCK record_delivery
UPDATE jobs
SET
  data = data || jsonb_build_object('callbackDelivered', true)
WHERE
  id = $job_id;

-- BLOCK record_recovered_outcome
UPDATE jobs
SET
  data = data || jsonb_build_object('outcome', $outcome::jsonb),
  output = $output
WHERE
  id = $job_id;
