CREATE TABLE file_edits (
    id bigserial PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    dir_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    s3_bucket TEXT,
    s3_root_key TEXT,
    UNIQUE (user_id, course_id, dir_name, file_name),
    UNIQUE (user_id, course_id, id, file_name)
)
