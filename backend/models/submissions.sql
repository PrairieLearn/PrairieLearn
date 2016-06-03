CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    sid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE,
    question_instance_id INTEGER NOT NULL REFERENCES question_instances ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    submitted_answer JSONB,
    type enum_submission_type,
    override_score DOUBLE PRECISION,
    open BOOLEAN,
    credit INTEGER,
    mode enum_mode
);
