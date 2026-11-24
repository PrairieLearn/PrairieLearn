ALTER TABLE courses
ADD CONSTRAINT courses_uuid_key UNIQUE USING INDEX courses_uuid_key,
ADD CONSTRAINT courses_uuid_not_null CHECK (uuid IS NOT NULL) NOT VALID;
