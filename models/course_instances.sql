CREATE TABLE IF NOT EXISTS course_instances (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID NOT NULL UNIQUE,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    short_name text,
    long_name text,
    number INTEGER,
    deleted_at TIMESTAMP WITH TIME ZONE
);
