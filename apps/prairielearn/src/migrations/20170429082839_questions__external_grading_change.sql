ALTER TABLE questions
DROP COLUMN IF EXISTS external_grading_autograder;

ALTER TABLE questions
DROP COLUMN IF EXISTS external_grading_environment;

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS external_grading_files TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS external_grading_entrypoint text;
