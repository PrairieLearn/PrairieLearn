CREATE TABLE IF NOT EXISTS test_sets (
    id SERIAL PRIMARY KEY,
    abbrev varchar(255),
    name varchar(255),
    heading varchar(255),
    color varchar(255),
    number INTEGER,
    course_id INTEGER REFERENCES courses,
    UNIQUE (name, course_id)
);
