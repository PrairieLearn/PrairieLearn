CREATE TYPE enum_workspace_host_state AS enum(
  'launching',
  'ready',
  'draining',
  'unhealthy',
  'terminating',
  'terminated'
);

ALTER TABLE workspace_hosts
ADD COLUMN state enum_workspace_host_state,
ADD COLUMN launched_at timestamptz,
ADD COLUMN unhealthy_at timestamptz,
ADD COLUMN ready_at timestamptz,
ADD COLUMN terminated_at timestamptz,
ADD COLUMN state_changed_at timestamptz;
