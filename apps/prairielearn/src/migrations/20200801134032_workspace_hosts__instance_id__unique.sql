ALTER TABLE workspace_hosts
-- squawk-ignore constraint-missing-not-valid
ADD UNIQUE (instance_id);
