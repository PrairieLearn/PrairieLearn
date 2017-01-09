CREATE TABLE IF NOT EXISTS job_sequences (
    id BIGSERIAL PRIMARY KEY,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finish_date TIMESTAMP WITH TIME ZONE,
    course_id BIGINT REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    number INTEGER,
    user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    authn_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    type TEXT,
    description TEXT,
    status enum_job_status DEFAULT 'Running',
    UNIQUE (course_id, number)
);
