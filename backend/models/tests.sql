CREATE TABLE IF NOT EXISTS tests (
    id SERIAL PRIMARY KEY,
    tid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    course_instance_id INTEGER REFERENCES course_instances,
    type enum_test_type,
    number varchar(20),
    title varchar(255),
    config JSONB,
    test_set_id INTEGER REFERENCES test_sets,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (tid, course_instance_id)
);
