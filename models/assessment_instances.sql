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
    duration INTERVAL DEFAULT INTERVAL '0 seconds',
    assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    points DOUBLE PRECISION DEFAULT 0,
    points_in_grading DOUBLE PRECISION DEFAULT 0,
    max_points DOUBLE PRECISION,
    score_perc DOUBLE PRECISION DEFAULT 0,
    score_perc_in_grading DOUBLE PRECISION DEFAULT 0,
    tmp_upgraded_iq_status BOOLEAN DEFAULT FALSE,
    UNIQUE (assessment_id, user_id, number)
);

CREATE INDEX IF NOT EXISTS assessment_instances_user_id_idx ON assessment_instances (user_id);


ALTER TABLE assessment_instances ADD COLUMN IF NOT EXISTS date_limit TIMESTAMP WITH TIME ZONE;
ALTER TABLE assessment_instances ADD COLUMN IF NOT EXISTS auto_close BOOLEAN DEFAULT FALSE;

ALTER TABLE assessment_instances ADD COLUMN IF NOT EXISTS tmp_upgraded_iq_status BOOLEAN DEFAULT FALSE;

ALTER TABLE assessment_instances DROP COLUMN IF EXISTS instructor_opened;

ALTER TABLE assessment_instances DROP CONSTRAINT IF EXISTS assessment_instances_number_assessment_id_user_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'assessment_instances_assessment_id_user_id_number_key'
        )
        THEN
        ALTER TABLE assessment_instances ADD UNIQUE (assessment_id, user_id, number);
    END IF;
END;
$$;
