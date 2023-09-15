SELECT
  wh.state,
  wh.id AS workspace_host_id,
  wh.instance_id,
  wh.load_count,
  wh.launched_at,
  wh.state_changed_at,
  wh.unhealthy_reason
FROM
  workspace_hosts AS wh
WHERE
  wh.state != 'terminated'
  OR (
    wh.state = 'terminated'
    AND wh.terminated_at > now() - interval '1 hour'
  )
ORDER BY
  wh.state,
  wh.launched_at,
  wh.instance_id;
