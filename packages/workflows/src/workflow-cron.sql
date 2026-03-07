-- BLOCK select_stale_running_workflows
SELECT
  *
FROM
  workflow_runs
WHERE
  status = 'running'
  AND locked_by IS NOT NULL
  AND heartbeat_at < now() - interval '2 minutes';
