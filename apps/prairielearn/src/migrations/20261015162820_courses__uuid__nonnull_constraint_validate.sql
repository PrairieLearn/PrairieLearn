ALTER TABLE courses VALIDATE CONSTRAINT courses_uuid_not_null;

ALTER TABLE courses
ALTER COLUMN uuid
SET NOT NULL;

ALTER TABLE courses
DROP CONSTRAINT courses_uuid_not_null;
