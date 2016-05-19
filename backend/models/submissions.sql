CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    sid varchar(255) UNIQUE,
    mongo_id varchar(255) UNIQUE,
    date TIMESTAMP WITH TIME ZONE,
    question_instance_id INTEGER REFERENCES question_instances,
    uid varchar(255), -- temporary, delete after Mongo import
    qiid varchar(255), -- temporary, delete after Mongo import
    score DOUBLE PRECISION, -- temporary, delete after Mongo import
    feedback JSONB, -- temporary, delete after Mongo import
    auth_user_id INTEGER REFERENCES users,
    submitted_answer JSONB,
    type enum_submission_type,
    override_score DOUBLE PRECISION,
    open BOOLEAN,
    credit INTEGER,
    mode enum_mode
);
