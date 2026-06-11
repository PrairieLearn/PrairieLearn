ALTER TABLE questions
ADD CONSTRAINT questions_external_grading_enabled_not_null CHECK (external_grading_enabled IS NOT NULL) NOT VALID;
