-- Make question UUIDs only unique within a certain course
ALTER TABLE questions
ADD UNIQUE (course_id, uuid);

ALTER TABLE questions
DROP CONSTRAINT questions_uuid_key;

-- Make course instance UUIDs only unique within a certain course
ALTER TABLE course_instances
ADD UNIQUE (course_id, uuid);

ALTER TABLE course_instances
DROP CONSTRAINT course_instances_uuid_key;

-- Make assessment UUIDs onlye unique withing a certain course instance
ALTER TABLE assessments
ADD UNIQUE (course_instance_id, uuid);

ALTER TABLE assessments
DROP CONSTRAINT assessments_uuid_key;
