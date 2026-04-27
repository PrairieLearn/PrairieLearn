ALTER TABLE course_instances
ADD CONSTRAINT course_instances_short_name_not_null CHECK (short_name IS NOT NULL) NOT VALID;
