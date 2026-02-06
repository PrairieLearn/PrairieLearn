ALTER TABLE alternative_groups VALIDATE CONSTRAINT alternative_groups_number_not_null;

ALTER TABLE alternative_groups
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE alternative_groups
DROP CONSTRAINT alternative_groups_number_not_null;

ALTER TABLE assessment_instances VALIDATE CONSTRAINT assessment_instances_number_not_null;

ALTER TABLE assessment_instances
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE assessment_instances
DROP CONSTRAINT assessment_instances_number_not_null;

ALTER TABLE assessment_modules VALIDATE CONSTRAINT assessment_modules_number_not_null;

ALTER TABLE assessment_modules
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE assessment_modules
DROP CONSTRAINT assessment_modules_number_not_null;

ALTER TABLE course_instance_access_rules VALIDATE CONSTRAINT course_instance_access_rules_number_not_null;

ALTER TABLE course_instance_access_rules
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE course_instance_access_rules
DROP CONSTRAINT course_instance_access_rules_number_not_null;

ALTER TABLE job_sequences VALIDATE CONSTRAINT job_sequences_number_not_null;

ALTER TABLE job_sequences
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE job_sequences
DROP CONSTRAINT job_sequences_number_not_null;

ALTER TABLE questions VALIDATE CONSTRAINT questions_number_not_null;

ALTER TABLE questions
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE questions
DROP CONSTRAINT questions_number_not_null;

ALTER TABLE tags VALIDATE CONSTRAINT tags_number_not_null;

ALTER TABLE tags
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE tags
DROP CONSTRAINT tags_number_not_null;

ALTER TABLE topics VALIDATE CONSTRAINT topics_number_not_null;

ALTER TABLE topics
ALTER COLUMN number
SET NOT NULL;

ALTER TABLE topics
DROP CONSTRAINT topics_number_not_null;
