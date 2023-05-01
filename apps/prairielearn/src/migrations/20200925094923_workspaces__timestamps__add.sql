ALTER TABLE workspaces
ADD COLUMN running_at timestamptz,
ADD COLUMN stopped_at timestamptz,
ADD COLUMN rebooted_at timestamptz,
ADD COLUMN reset_at timestamptz;
