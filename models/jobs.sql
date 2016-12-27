CREATE TABLE IF NOT EXISTS jobs (
    id BIGSERIAL PRIMARY KEY,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finish_date TIMESTAMP WITH TIME ZONE,
    course_id BIGINT REFERENCES courses ON DELETE CASCADE ON UPDATE CASCADE,
    number INTEGER,
    job_sequence_id BIGINT REFERENCES job_sequences ON DELETE CASCADE ON UPDATE CASCADE,
    number_in_sequence INTEGER,
    last_in_sequence BOOLEAN,
    user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    authn_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    type TEXT,
    description TEXT,
    status enum_job_status,
    stdin TEXT,
    stdout TEXT,
    stderr TEXT,
    output TEXT,
    command TEXT,
    arguments TEXT[],
    working_directory TEXT,
    exit_code INTEGER,
    exit_signal TEXT,
    error_message TEXT,
    UNIQUE (course_id, number),
    UNIQUE (job_sequence_id, number_in_sequence)
);

ALTER TABLE jobs ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE jobs ALTER COLUMN course_id SET DATA TYPE BIGINT;
ALTER TABLE jobs ALTER COLUMN job_sequence_id SET DATA TYPE BIGINT;
ALTER TABLE jobs ALTER COLUMN user_id SET DATA TYPE BIGINT;
ALTER TABLE jobs ALTER COLUMN authn_user_id SET DATA TYPE BIGINT;
