ALTER TABLE alternative_groups
ADD CONSTRAINT alternative_groups_number_not_null CHECK (number IS NOT NULL) NOT VALID;

ALTER TABLE assessment_instances
ADD CONSTRAINT assessment_instances_number_not_null CHECK (number IS NOT NULL) NOT VALID;

ALTER TABLE assessment_modules
ADD CONSTRAINT assessment_modules_number_not_null CHECK (number IS NOT NULL) NOT VALID;

ALTER TABLE course_instance_access_rules
ADD CONSTRAINT course_instance_access_rules_number_not_null CHECK (number IS NOT NULL) NOT VALID;

ALTER TABLE job_sequences
ADD CONSTRAINT job_sequences_number_not_null CHECK (number IS NOT NULL) NOT VALID;

ALTER TABLE tags
ADD CONSTRAINT tags_number_not_null CHECK (number IS NOT NULL) NOT VALID;

ALTER TABLE topics
ADD CONSTRAINT topics_number_not_null CHECK (number IS NOT NULL) NOT VALID;
