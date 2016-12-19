CREATE TABLE IF NOT EXISTS assessment_sets (
    id SERIAL PRIMARY KEY,
    abbrev varchar(255),
    name varchar(255),
    heading varchar(255),
    color varchar(255),
    number INTEGER,
    course_id INTEGER NOT NULL REFERENCES courses ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (name, course_id)
);
