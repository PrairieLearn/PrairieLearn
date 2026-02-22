ALTER TABLE course_instances VALIDATE CONSTRAINT course_instances_short_name_not_null;

ALTER TABLE course_instances
ALTER COLUMN short_name
SET NOT NULL;

ALTER TABLE course_instances
DROP CONSTRAINT course_instances_short_name_not_null;
