CREATE TABLE IF NOT EXISTS course_permissions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    course_role enum_course_role,
    UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS course_permissions_course_id_idx ON course_permissions (course_id);
