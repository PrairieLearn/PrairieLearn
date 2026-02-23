ALTER TABLE assessment_instances VALIDATE CONSTRAINT assessment_instances_number_not_null;

ALTER TABLE assessment_instances
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE assessment_instances
DROP CONSTRAINT assessment_instances_number_not_null;
