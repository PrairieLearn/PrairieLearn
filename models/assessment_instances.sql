CREATE TABLE IF NOT EXISTS assessment_instances (
    id BIGSERIAL PRIMARY KEY,
    tiid text UNIQUE, -- temporary, delete after Mongo import
    qids JSONB, -- temporary, delete after Mongo import
    obj JSONB, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    mode enum_mode, -- mode at creation
    number INTEGER,
    date_limit TIMESTAMP WITH TIME ZONE, -- if NOT NULL, when we have to finish by
    open BOOLEAN DEFAULT TRUE,
    closed_at TIMESTAMP WITH TIME ZONE,
    auto_close BOOLEAN DEFAULT FALSE,
    allow_review BOOLEAN DEFAULT TRUE,
    duration INTERVAL DEFAULT INTERVAL '0 seconds',
    assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    points DOUBLE PRECISION DEFAULT 0,
    points_in_grading DOUBLE PRECISION DEFAULT 0,
    max_points DOUBLE PRECISION,
    score_perc DOUBLE PRECISION DEFAULT 0,
    score_perc_in_grading DOUBLE PRECISION DEFAULT 0,
    UNIQUE (number, assessment_id, user_id)
);

ALTER TABLE assessment_instances ADD COLUMN IF NOT EXISTS date_limit TIMESTAMP WITH TIME ZONE;
ALTER TABLE assessment_instances ADD COLUMN IF NOT EXISTS auto_close BOOLEAN DEFAULT FALSE;
ALTER TABLE assessment_instances ADD COLUMN IF NOT EXISTS allow_review BOOLEAN DEFAULT TRUE;
