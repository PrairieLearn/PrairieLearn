ALTER TABLE questions ADD COLUMN IF NOT EXISTS workspace_required_file_names text[] DEFAULT ARRAY[]::text[];
