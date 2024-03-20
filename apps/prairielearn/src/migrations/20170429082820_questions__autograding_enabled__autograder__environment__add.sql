ALTER TABLE questions
ADD COLUMN IF NOT EXISTS autograding_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS autograder text;

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS environment text;
