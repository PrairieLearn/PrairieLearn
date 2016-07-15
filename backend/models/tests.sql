CREATE TABLE IF NOT EXISTS tests (
    id SERIAL PRIMARY KEY,
    tid varchar(255),
    course_instance_id INTEGER NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    type enum_test_type,
    number varchar(20),
    title varchar(255),
    config JSONB,
    test_set_id INTEGER NOT NULL REFERENCES test_sets ON DELETE SET NULL ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    obj JSONB,
    UNIQUE (tid, course_instance_id)
);

ALTER TABLE tests DROP CONSTRAINT IF EXISTS tests_tid_key;
