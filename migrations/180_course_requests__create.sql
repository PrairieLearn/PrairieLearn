CREATE TYPE course_request_status AS ENUM ('pending', 'approved', 'denied');

CREATE TABLE IF NOT EXISTS course_requests (
    approved_by bigint REFERENCES administrators(id) ON UPDATE CASCADE ON DELETE CASCADE,
    approval_status course_request_status DEFAULT 'pending',
    id bigserial PRIMARY KEY,
    institution_id bigint REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE CASCADE,
    short_name text,
    title text,
    user_id bigint REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE
);
