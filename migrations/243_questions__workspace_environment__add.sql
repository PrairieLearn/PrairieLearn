ALTER TABLE questions ADD COLUMN workspace_environment text[] DEFAULT ARRAY[]::text[];
