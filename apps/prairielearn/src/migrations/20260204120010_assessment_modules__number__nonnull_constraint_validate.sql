ALTER TABLE assessment_modules VALIDATE CONSTRAINT assessment_modules_number_not_null;

ALTER TABLE assessment_modules
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE assessment_modules
DROP CONSTRAINT assessment_modules_number_not_null;
