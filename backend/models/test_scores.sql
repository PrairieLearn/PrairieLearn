CREATE TABLE IF NOT EXISTS test_scores (
    id SERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE,
    points DOUBLE PRECISION,
    max_points DOUBLE PRECISION,
    score_perc INTEGER,
    test_instance_id INTEGER REFERENCES test_instances,
    auth_user_id INTEGER REFERENCES users
);
