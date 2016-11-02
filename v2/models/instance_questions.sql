CREATE TABLE IF NOT EXISTS instance_questions (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    open BOOLEAN DEFAULT TRUE,
    number INTEGER,
    order_by INTEGER DEFAULT floor(random() * 1000000),
    points DOUBLE PRECISION DEFAULT 0,
    points_in_grading DOUBLE PRECISION DEFAULT 0,
    score_perc INTEGER DEFAULT 0,
    score_perc_in_grading INTEGER DEFAULT 0,
    current_value DOUBLE PRECISION,
    number_attempts INTEGER DEFAULT 0,
    points_list DOUBLE PRECISION[],
    assessment_instance_id INTEGER NOT NULL REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_question_id INTEGER NOT NULL REFERENCES assessment_questions ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (assessment_question_id, assessment_instance_id)
);

DO $$
    BEGIN
        ALTER TABLE instance_questions ADD COLUMN points_list DOUBLE PRECISION[];
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE instance_questions ADD COLUMN open BOOLEAN DEFAULT TRUE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE instance_questions ADD COLUMN score_perc INTEGER DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE instance_questions ADD COLUMN points_in_grading DOUBLE PRECISION DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

DO $$
    BEGIN
        ALTER TABLE instance_questions ADD COLUMN score_perc_in_grading INTEGER DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;
