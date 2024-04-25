ALTER TABLE questions
ADD COLUMN IF NOT EXISTS workspace_graded_files text[] DEFAULT ARRAY[]::text[];
