ALTER TABLE workspace_hosts
ADD COLUMN IF NOT EXISTS unhealthy_reason text;
