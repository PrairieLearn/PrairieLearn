SELECT
    wh.state,
    wh.instance_id,
    wh.load_count,
    wh.launched_at,
    wh.state_changed_at
FROM workspace_hosts AS wh
WHERE
    wh.state != 'terminated'
    OR (wh.state = 'terminated' AND wh.terminted_at > now() - interval '1 hour')
ORDER BY wh.state, wh.launched_at, wh.instance_id;
