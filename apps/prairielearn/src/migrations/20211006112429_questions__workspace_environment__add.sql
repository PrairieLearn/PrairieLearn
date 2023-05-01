ALTER TABLE questions
ADD COLUMN workspace_environment jsonb not null default '{}'::jsonb;
