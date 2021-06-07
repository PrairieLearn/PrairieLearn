CREATE TABLE IF NOT EXISTS assessment_units (
    course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT,
    heading TEXT,
    number INTEGER,
)