CREATE TABLE IF NOT EXISTS assessment_score_logs (
    id SERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    points DOUBLE PRECISION,
    points_in_grading DOUBLE PRECISION,
    max_points DOUBLE PRECISION,
    score_perc DOUBLE PRECISION,
    score_perc_in_grading DOUBLE PRECISION,
    assessment_instance_id INTEGER NOT NULL REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id INTEGER REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE assessment_score_logs ALTER COLUMN score_perc SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE assessment_score_logs ALTER COLUMN score_perc_in_grading SET DATA TYPE DOUBLE PRECISION;
