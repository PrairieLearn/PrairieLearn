ALTER TABLE assessment_instances
ADD CONSTRAINT assessment_instances_number_not_null CHECK (number IS NOT NULL) NOT VALID;
