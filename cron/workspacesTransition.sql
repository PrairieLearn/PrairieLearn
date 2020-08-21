-- select_nonstopped_workspace_hosts
SELECT
    wh.id,
    wh.instance_id,
    wh.load_count,
    wh.hostname
FROM
    workspace_hosts AS wh
LEFT JOIN
    workspaces AS W ON (w.workspace_host_id = w.id) AND (w.state = 'launching' OR w.state = 'running')
WHERE
    wh.state != 'terminated';

-- set_host_unhealthy
UPDATE workspace_hosts
SET
    state = 'unhealthy'
    unhealthy_at = NOW()
WHERE
    instance_id = $instance_id;

-- add_terminating_hosts
INSERT INTO workspace_hosts
    (state, instance_id)
    (SELECT 'terminating', UNNEST($instances));

-- set_terminated_hosts
UPDATE workspace_hosts
SET state='terminated',
    terminated_at = NOW()
WHERE id IN (SELECT UNNEST($instances));
