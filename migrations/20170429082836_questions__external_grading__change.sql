ALTER TABLE questions
DROP COLUMN IF EXISTS autograding_enabled;

ALTER TABLE questions
DROP COLUMN IF EXISTS autograder;

ALTER TABLE questions
DROP COLUMN IF EXISTS environment;

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS external_grading_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS external_grading_autograder text;

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS external_grading_environment text;

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS external_grading_image text;
