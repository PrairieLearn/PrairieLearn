CREATE TABLE IF NOT EXISTS test_states (
    id SERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE,
    open BOOLEAN,
    test_instance_id INTEGER REFERENCES test_instances,
    auth_user_id INTEGER REFERENCES users
);
