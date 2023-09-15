ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS message text;

ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS message_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;
