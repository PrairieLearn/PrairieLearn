-- BLOCK select_nonterminated_workspace_hosts
SELECT
  wh.instance_id
FROM
  workspace_hosts AS wh
WHERE
  -- Equivalent to `wh.state != 'terminated'`, but written as an explicit list
  -- so it can use `workspace_hosts_state_terminated_at_key`. The table keeps
  -- every host ever launched, so a `!=` filter scans all of them.
  wh.state IN (
    'launching',
    'ready',
    'draining',
    'unhealthy',
    'terminating'
  );

-- BLOCK select_healthy_hosts
SELECT
  wh.id,
  wh.instance_id,
  wh.hostname
FROM
  workspace_hosts AS wh
WHERE
  wh.state = 'ready'
  OR wh.state = 'draining';

-- BLOCK add_terminating_hosts
INSERT INTO
  workspace_hosts (state, state_changed_at, instance_id)
SELECT
  'terminating',
  NOW(),
  UNNEST($instances::text[])
ON CONFLICT (instance_id) DO UPDATE
SET
  state = EXCLUDED.state,
  state_changed_at = EXCLUDED.state_changed_at;
