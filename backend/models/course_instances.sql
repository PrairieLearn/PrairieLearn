CREATE TABLE IF NOT EXISTS course_instances (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses ON DELETE CASCADE,
    semester_id INTEGER REFERENCES semesters ON DELETE CASCADE,
    UNIQUE (course_id, semester_id)
);
