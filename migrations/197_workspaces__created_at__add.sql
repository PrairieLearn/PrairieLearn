ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT current_timestamp;
