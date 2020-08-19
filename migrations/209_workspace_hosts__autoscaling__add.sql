CREATE TYPE enum_workspace_host_state AS enum ('launching', 'ready', 'draining', 'unhealthy', 'terminating', 'stopped');

ALTER TABLE workspace_hosts
ADD COLUMN state enum_workspace_host_state,
ADD COLUMN launched_at timestamptz,
ADD COLUMN became_unhealthy_at timestamptz;
