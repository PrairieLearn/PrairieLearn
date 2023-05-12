ALTER TABLE questions
ADD COLUMN IF NOT EXISTS workspace_enable_networking BOOLEAN;
