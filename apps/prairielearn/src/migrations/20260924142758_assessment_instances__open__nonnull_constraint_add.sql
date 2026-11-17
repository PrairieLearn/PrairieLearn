SET
  LOCAL lock_timeout = '5s';

ALTER TABLE assessment_instances
ADD CONSTRAINT assessment_instances_open_not_null CHECK (open IS NOT NULL) NOT VALID;
