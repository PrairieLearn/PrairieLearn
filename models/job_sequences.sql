CREATE TABLE IF NOT EXISTS job_sequences (
    id BIGSERIAL PRIMARY KEY,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finish_date TIMESTAMP WITH TIME ZONE,
    course_id BIGINT REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    course_instance_id BIGINT REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_id BIGINT REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    number INTEGER,
    user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    authn_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    type TEXT,
    description TEXT,
    status enum_job_status DEFAULT 'Running',
    UNIQUE (course_id, number)
);

CREATE INDEX IF NOT EXISTS job_sequences_assessment_id_idx ON job_sequences (assessment_id);
CREATE INDEX IF NOT EXISTS job_sequences_course_id_idx ON job_sequences (course_id);

ALTER TABLE job_sequences ADD COLUMN IF NOT EXISTS course_instance_id BIGINT REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE job_sequences ADD COLUMN IF NOT EXISTS assessment_id BIGINT REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE;
