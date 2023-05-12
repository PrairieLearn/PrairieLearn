-- BLOCK insert_new_instances
INSERT INTO
  workspace_hosts (instance_id, state, launched_at, state_changed_at) (
    SELECT
      unnest($instance_ids),
      'launching',
      NOW(),
      NOW()
  )
ON CONFLICT (instance_id) DO
UPDATE
SET
  state = EXCLUDED.state,
  launched_at = EXCLUDED.launched_at,
  state_changed_at = EXCLUDED.state_changed_at;
