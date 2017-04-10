CREATE TABLE IF NOT EXISTS instance_questions (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    authn_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    open BOOLEAN DEFAULT TRUE,
    number INTEGER,
    order_by INTEGER DEFAULT floor(random() * 1000000),
    points DOUBLE PRECISION DEFAULT 0,
    points_in_grading DOUBLE PRECISION DEFAULT 0,
    score_perc DOUBLE PRECISION DEFAULT 0,
    score_perc_in_grading DOUBLE PRECISION DEFAULT 0,
    current_value DOUBLE PRECISION,
    number_attempts INTEGER DEFAULT 0,
    points_list DOUBLE PRECISION[],
    status enum_instance_question_status DEFAULT 'unanswered'::enum_instance_question_status,
    duration INTERVAL DEFAULT INTERVAL '0 seconds',
    first_duration INTERVAL,
    assessment_instance_id BIGINT NOT NULL REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (assessment_question_id, assessment_instance_id)
);

CREATE INDEX IF NOT EXISTS instance_questions_assessment_instance_id_idx ON instance_questions (assessment_instance_id);

ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS status enum_instance_question_status DEFAULT 'unanswered';

ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS authn_user_id bigint;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'instance_questions_authn_user_id_fkey'
        )
        THEN
        ALTER TABLE instance_questions ADD FOREIGN KEY (authn_user_id) REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END;
$$;

ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS duration INTERVAL DEFAULT INTERVAL '0 seconds';
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS first_duration INTERVAL;
