ALTER TABLE questions
ADD COLUMN IF NOT EXISTS workspace_sync_ignore text[] DEFAULT ARRAY[]::text[];
