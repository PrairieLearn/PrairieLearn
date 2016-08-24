CREATE TABLE IF NOT EXISTS instance_questions (
    id SERIAL PRIMARY KEY,
    number INTEGER,
    order_by INTEGER,
    points DOUBLE PRECISION,
    current_value DOUBLE PRECISION,
    number_attempts INTEGER,
    test_instance_id INTEGER NOT NULL REFERENCES test_instances ON DELETE CASCADE ON UPDATE CASCADE,
    test_question_id INTEGER NOT NULL REFERENCES test_questions ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (test_question_id, test_instance_id)
);
