ALTER TABLE workspace_hosts
ADD COLUMN IF NOT EXISTS load_count integer default 0;
