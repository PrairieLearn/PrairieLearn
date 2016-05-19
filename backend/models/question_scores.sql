CREATE TABLE IF NOT EXISTS question_scores (
    id SERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE,
    grading_id INTEGER REFERENCES gradings,
    question_instance_id INTEGER REFERENCES question_instances,
    test_score_id INTEGER REFERENCES test_scores,
    auth_user_id INTEGER REFERENCES users,
    points DOUBLE PRECISION,
    max_points DOUBLE PRECISION
);
