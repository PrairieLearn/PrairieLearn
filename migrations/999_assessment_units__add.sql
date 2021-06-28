CREATE TABLE IF NOT EXISTS assessment_units (
    course_id BIGINT NOT NULL REFERENCES pl_courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL,
    heading TEXT,
    number INTEGER,
    PRIMARY KEY (course_id, name)
)