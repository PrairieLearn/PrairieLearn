CREATE TABLE IF NOT EXISTS topics (
    id SERIAL PRIMARY KEY,
    short_name varchar(255),
    name varchar(255),
    number INTEGER,
    color varchar(255),
    course_id INTEGER REFERENCES courses,
    UNIQUE (short_name, course_id)
);
