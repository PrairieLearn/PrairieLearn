ALTER TABLE courses VALIDATE CONSTRAINT courses_short_name_not_null;

ALTER TABLE courses
ALTER COLUMN short_name
SET NOT NULL;

ALTER TABLE courses
DROP CONSTRAINT courses_short_name_not_null;
