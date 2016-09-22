CREATE TABLE IF NOT EXISTS question_score_logs (
    id SERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    instance_question_id INTEGER NOT NULL REFERENCES instance_questions ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id INTEGER REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    points DOUBLE PRECISION,
    max_points DOUBLE PRECISION,
    score_perc INTEGER
);

DO $$
    BEGIN
        ALTER TABLE question_score_logs ADD COLUMN score_perc INTEGER;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

ALTER TABLE question_score_logs ALTER COLUMN date SET DEFAULT CURRENT_TIMESTAMP;
