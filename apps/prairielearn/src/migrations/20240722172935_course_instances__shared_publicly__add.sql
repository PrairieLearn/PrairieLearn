ALTER TABLE course_instances
ADD COLUMN shared_publicly BOOLEAN NOT NULL DEFAULT TRUE; -- TEST, make FALSE