-- BLOCK select_workspaces
SELECT
  w.id,
  w.state,
  wh.id AS workspace_host_id,
  wh.instance_id AS workspace_host_instance_id,
  wh.hostname AS workspace_host_hostname,
  wh.state AS workspace_host_state
FROM
  workspaces AS w
  JOIN workspace_hosts AS wh ON (w.workspace_host_id = wh.id)
WHERE
  w.state IN ('launching', 'running');
