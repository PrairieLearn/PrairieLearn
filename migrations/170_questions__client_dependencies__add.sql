ALTER TABLE questions ADD COLUMN dependencies jsonb DEFAULT '{}'::jsonb;
