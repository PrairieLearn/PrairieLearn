ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS state_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;
