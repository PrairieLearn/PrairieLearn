CREATE TABLE IF NOT EXISTS course_permissions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    course_id BIGINT NOT NULL REFERENCES courses ON DELETE CASCADE ON UPDATE CASCADE,
    course_role enum_course_role,
    UNIQUE (user_id, course_id)
);
