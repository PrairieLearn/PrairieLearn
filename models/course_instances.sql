CREATE TABLE IF NOT EXISTS course_instances (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID NOT NULL UNIQUE,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    short_name text,
    long_name text,
    number INTEGER,
    display_timezone text,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS course_instances_course_id_idx ON course_instances (course_id);

-- FIXME: make display_timezone NOT NULL in the future
