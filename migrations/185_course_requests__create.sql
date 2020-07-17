CREATE TYPE enum_course_request_status AS ENUM ('pending', 'approved', 'denied');

CREATE TABLE IF NOT EXISTS course_requests (
    approved_by bigint REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
    approved_status enum_course_request_status DEFAULT 'pending',
    github_user text,
    id bigserial PRIMARY KEY,
    short_name text,
    title text,
    user_id bigint REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE
);
