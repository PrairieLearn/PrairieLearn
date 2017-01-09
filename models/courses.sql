CREATE TABLE IF NOT EXISTS pl_courses (
    id BIGSERIAL PRIMARY KEY,
    short_name text,
    title text,
    grading_queue text,
    path text,
    repository text,
    deleted_at TIMESTAMP WITH TIME ZONE
);
