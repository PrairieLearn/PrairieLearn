ALTER TABLE questions
ADD COLUMN IF NOT EXISTS draft_version integer;
