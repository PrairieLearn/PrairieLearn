-- BLOCK insert_new_instances
INSERT INTO workspace_hosts
    (instance_id, state, launched_at)
    ($instance_ids, 'launching', now())
ON CONFLICT (instance_id) DO UPDATE SET
    state = EXCLUDED.state,
    launched_at = EXCLUDED.launched_at;
