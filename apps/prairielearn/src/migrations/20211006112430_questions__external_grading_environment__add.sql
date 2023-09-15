ALTER TABLE questions
ADD COLUMN external_grading_environment jsonb not null default '{}'::jsonb;
