ALTER TABLE questions VALIDATE CONSTRAINT questions_external_grading_enabled_not_null;

ALTER TABLE questions
ALTER COLUMN external_grading_enabled
SET NOT NULL;

ALTER TABLE questions
DROP CONSTRAINT questions_external_grading_enabled_not_null;
