CREATE TABLE IF NOT EXISTS instance_questions (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    number INTEGER,
    order_by INTEGER DEFAULT floor(random() * 1000000),
    points DOUBLE PRECISION DEFAULT 0,
    current_value DOUBLE PRECISION,
    number_attempts INTEGER DEFAULT 0,
    assessment_instance_id INTEGER NOT NULL REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_question_id INTEGER NOT NULL REFERENCES assessment_questions ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (assessment_question_id, assessment_instance_id)
);
