ALTER TABLE questions
ADD COLUMN dependencies jsonb NOT NULL DEFAULT '{}'::jsonb;
