-- BLOCK select_stale_workflows
SELECT
  *
FROM
  workflow_runs
WHERE
  status = 'running'
  AND heartbeat_at < NOW() - INTERVAL '2 minutes';

-- BLOCK clear_stale_lock
UPDATE workflow_runs
SET
  status = 'waiting_for_input',
  locked_at = NULL,
  heartbeat_at = NULL
WHERE
  id = $id;
