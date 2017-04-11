CREATE TABLE IF NOT EXISTS submissions (
    id BIGSERIAL PRIMARY KEY,
    sid text UNIQUE, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    variant_id BIGINT NOT NULL REFERENCES variants ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    submitted_answer JSONB,
    type enum_submission_type,
    override_score DOUBLE PRECISION,
    credit INTEGER,
    mode enum_mode,
    grading_method enum_grading_method,
    grading_requested_at TIMESTAMP WITH TIME ZONE,
    graded_at TIMESTAMP WITH TIME ZONE,
    score DOUBLE PRECISION,
    correct BOOLEAN,
    feedback JSONB,
    duration INTERVAL DEFAULT INTERVAL '0 seconds'
);

CREATE INDEX IF NOT EXISTS submissions_variant_id_idx ON submissions (variant_id);
