CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    sid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE,
    instance_question_id INTEGER NOT NULL REFERENCES instance_questions ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id INTEGER REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    submitted_answer JSONB,
    type enum_submission_type,
    override_score DOUBLE PRECISION,
    open BOOLEAN,
    credit INTEGER,
    mode enum_mode,
    graded_at TIMESTAMP WITH TIME ZONE,
    score DOUBLE PRECISION,
    feedback JSONB
);
