CREATE TABLE IF NOT EXISTS test_instances (
    id SERIAL PRIMARY KEY,
    tiid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    qids JSONB, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE,
    number INTEGER,
    test_id INTEGER REFERENCES tests,
    user_id INTEGER REFERENCES users,
    auth_user_id INTEGER REFERENCES users,
    UNIQUE (number, test_id, user_id)
);
