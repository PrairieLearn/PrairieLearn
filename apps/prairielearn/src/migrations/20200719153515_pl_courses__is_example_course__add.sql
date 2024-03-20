ALTER TABLE pl_courses
ADD COLUMN example_course boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS pl_courses_example_course_key ON pl_courses (example_course);
