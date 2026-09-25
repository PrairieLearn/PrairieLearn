SET
  LOCAL lock_timeout = '5s';

ALTER TABLE assessment_instances VALIDATE CONSTRAINT assessment_instances_open_not_null;

ALTER TABLE assessment_instances
ALTER COLUMN open
SET NOT NULL;

ALTER TABLE assessment_instances
DROP CONSTRAINT assessment_instances_open_not_null;
