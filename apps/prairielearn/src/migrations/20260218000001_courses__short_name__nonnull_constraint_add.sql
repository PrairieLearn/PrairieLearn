ALTER TABLE courses
ADD CONSTRAINT courses_short_name_not_null CHECK (short_name IS NOT NULL) NOT VALID;
