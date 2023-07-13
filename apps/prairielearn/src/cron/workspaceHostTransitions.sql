-- BLOCK select_nonterminated_workspace_hosts
SELECT
  wh.instance_id
FROM
  workspace_hosts AS wh
WHERE
  wh.state != 'terminated';

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
  UNNEST($instances)
ON CONFLICT (instance_id) DO
UPDATE
SET
  state = EXCLUDED.state,
  state_changed_at = EXCLUDED.state_changed_at;
