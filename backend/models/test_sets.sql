CREATE TABLE IF NOT EXISTS test_sets (
    id SERIAL PRIMARY KEY,
    short_name varchar(255),
    long_name varchar(255),
    color varchar(255),
    number INTEGER,
    course_instance_id INTEGER REFERENCES course_instances
);
