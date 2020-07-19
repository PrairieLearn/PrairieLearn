ALTER TABLE pl_courses ADD COLUMN is_example_course boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS pl_courses_is_example_course_key ON pl_courses (is_example_course);
