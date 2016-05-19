CREATE TABLE IF NOT EXISTS gradings (
    id SERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE,
    submission_id INTEGER REFERENCES submissions,
    auth_user_id INTEGER UNIQUE REFERENCES users,
    score DOUBLE PRECISION,
    feedback JSONB
);
