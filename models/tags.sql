CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name varchar(255),
    number INTEGER,
    color varchar(255),
    course_id INTEGER NOT NULL REFERENCES courses ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (name, course_id)
);
