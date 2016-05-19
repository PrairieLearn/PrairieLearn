CREATE TABLE IF NOT EXISTS test_questions (
    id SERIAL PRIMARY KEY,
    number INTEGER,
    max_points DOUBLE PRECISION,
    points_list DOUBLE PRECISION[],
    init_points DOUBLE PRECISION,
    test_id INTEGER REFERENCES tests,
    zone_id INTEGER REFERENCES zones,
    question_id INTEGER REFERENCES questions,
    deleted_at TIMESTAMP WITH TIME ZONE
);
