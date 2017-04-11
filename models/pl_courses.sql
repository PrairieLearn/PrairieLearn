CREATE TABLE IF NOT EXISTS pl_courses (
    id BIGSERIAL PRIMARY KEY,
    short_name text,
    title text,
    display_timezone text,
    grading_queue text,
    path text,
    repository text,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- FIXME: make display_timezone NOT NULL in the future
